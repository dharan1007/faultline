import { assertRevision, ddmin, scoreSuspicion } from './core.js';
import { htmlUnits, cssUnits, jsUnits, removeUnits } from './reducers.js';

const clone = (value) => structuredClone(value);
const unitsFor = (axis, source) => axis === 'html' ? htmlUnits(source) : axis === 'css' ? cssUnits(source) : jsUnits(source);

export class FaultlineDomain {
  constructor(initialCase, runner) {
    this.state = {
      case: clone(initialCase),
      revision: 'r1',
      pins: [],
      ledger: [],
      revisions: [{revision:'r1', case:clone(initialCase)}]
    };
    this.runner = runner;
  }

  nextRevision() { return `r${Number(this.state.revision.slice(1)) + 1}`; }
  snapshot() { return clone(this.state); }
  inspect() {
    return {
      revision:this.state.revision,
      case:clone(this.state.case),
      pins:[...this.state.pins],
      unitCounts:{
        html:htmlUnits(this.state.case.html).length,
        css:cssUnits(this.state.case.css).length,
        js:jsUnits(this.state.case.js).length
      },
      latest:this.state.ledger.at(-1) || null
    };
  }

  commit(nextCase, event) {
    this.state.case = clone(nextCase);
    this.state.revision = this.nextRevision();
    this.state.revisions.push({revision:this.state.revision, case:clone(nextCase)});
    this.state.ledger.push({...event, revision:this.state.revision, at:new Date().toISOString()});
    return this.inspect();
  }

  defineOracle({expectedRevision, oracle}) {
    assertRevision(expectedRevision, this.state.revision);
    return this.commit({...this.state.case, oracle:clone(oracle)}, {kind:'define_oracle'});
  }

  async run({expectedRevision}={}) {
    if (expectedRevision) assertRevision(expectedRevision, this.state.revision);
    const result = await this.runner(clone(this.state.case));
    this.state.ledger.push({kind:'run', status:result.status, evidence:result.evidence || {}, revision:this.state.revision, at:new Date().toISOString()});
    return result;
  }

  async probe({expectedRevision, axis, unitId}) {
    assertRevision(expectedRevision, this.state.revision);
    const source = this.state.case[axis];
    const unit = unitsFor(axis, source).find((u) => u.id === unitId);
    if (!unit) throw new Error('UNIT_NOT_FOUND');
    if (this.state.pins.includes(`${axis}:${unitId}`)) throw new Error('UNIT_PINNED');
    const candidate = {...this.state.case, [axis]:removeUnits(source,[unit])};
    const result = await this.runner(candidate);
    this.state.ledger.push({kind:'probe', axis, unitId, status:result.status, evidence:result.evidence || {}, revision:this.state.revision, at:new Date().toISOString()});
    return {...result, canonicalRevision:this.state.revision, mutated:false};
  }

  async reduce({expectedRevision, axis, maxTrials=100}) {
    assertRevision(expectedRevision, this.state.revision);
    const source = this.state.case[axis];
    const allUnits = unitsFor(axis, source).map((unit) => ({
      ...unit,
      depth: Number.isInteger(unit.depth) ? unit.depth : 0,
      parentId: unit.parentId ?? null
    }));
    const byId = new Map(allUnits.map((unit) => [unit.id, unit]));
    const pinned = new Set(
      this.state.pins
        .filter((entry) => entry.startsWith(`${axis}:`))
        .map((entry) => entry.slice(axis.length + 1))
    );

    // A pinned descendant is meaningless if an ancestor can be removed, so pins
    // implicitly protect their entire ancestor chain during hierarchical reduction.
    const protectedIds = new Set(pinned);
    for (const pinnedId of pinned) {
      let current = byId.get(pinnedId);
      while (current?.parentId) {
        protectedIds.add(current.parentId);
        current = byId.get(current.parentId);
      }
    }

    const removedIds = new Set();
    const experiments = [];
    const frontiers = [];
    let trialCount = 0;

    const hasRemovedAncestor = (unit, additionallyRemoved = new Set()) => {
      let current = unit;
      while (current?.parentId) {
        if (removedIds.has(current.parentId) || additionallyRemoved.has(current.parentId)) return true;
        current = byId.get(current.parentId);
      }
      return false;
    };

    const materialize = (additionallyRemoved = new Set()) => {
      const ids = new Set([...removedIds, ...additionallyRemoved]);
      const units = allUnits.filter((unit) => ids.has(unit.id));
      return removeUnits(source, units);
    };

    const maxDepth = allUnits.reduce((max, unit) => Math.max(max, unit.depth), 0);
    for (let depth = 0; depth <= maxDepth; depth++) {
      const frontier = allUnits.filter((unit) => unit.depth === depth && !removedIds.has(unit.id) && !hasRemovedAncestor(unit));
      if (!frontier.length) continue;

      const removable = frontier.filter((unit) => !protectedIds.has(unit.id));
      const overlapFree = frontier.every((unit, index) => frontier.slice(index + 1).every((other) => unit.end <= other.start || other.end <= unit.start));
      if (!removable.length) {
        frontiers.push({ depth, candidates:frontier.length, removable:0, removed:0, kept:frontier.length, overlapFree });
        continue;
      }

      const result = await ddmin(removable, async (keptRemovable) => {
        if (++trialCount > maxTrials) return 'UNRESOLVED';
        const keptIds = new Set(keptRemovable.map((unit) => unit.id));
        const omitted = new Set(removable.filter((unit) => !keptIds.has(unit.id)).map((unit) => unit.id));
        const candidateSource = materialize(omitted);
        const candidate = {...this.state.case, [axis]:candidateSource};
        const outcome = await this.runner(candidate);
        const present = allUnits
          .filter((unit) => !removedIds.has(unit.id) && !omitted.has(unit.id) && !hasRemovedAncestor(unit, omitted))
          .map((unit) => unit.id);
        experiments.push({status:outcome.status, present});
        return outcome.status;
      });

      const keptIds = new Set(result.items.map((unit) => unit.id));
      const removedThisFrontier = removable.filter((unit) => !keptIds.has(unit.id));
      for (const unit of removedThisFrontier) removedIds.add(unit.id);
      frontiers.push({
        depth,
        candidates:frontier.length,
        removable:removable.length,
        removed:removedThisFrontier.length,
        kept:frontier.length - removedThisFrontier.length,
        overlapFree
      });
    }

    const nextCase = {...this.state.case, [axis]:materialize()};
    const final = await this.runner(nextCase);
    if (final.status !== 'FAIL') throw new Error('REDUCTION_LOST_FAILURE');
    const before = source.length;
    const after = nextCase[axis].length;
    const removed = allUnits.filter((unit) => removedIds.has(unit.id)).length;
    const committed = this.commit(nextCase, {
      kind:'reduce',
      axis,
      trials:trialCount,
      removed,
      frontiers:frontiers.length,
      reduction:before ? 1-after/before : 0
    });
    return {
      ...committed,
      result:{
        status:final.status,
        before,
        after,
        reduction:before ? 1-after/before : 0,
        trials:trialCount,
        frontiers,
        suspicion:scoreSuspicion(experiments)
      }
    };
  }

  pin({expectedRevision, unitId, axis='html', pinned=true}) {
    assertRevision(expectedRevision, this.state.revision);
    const key = `${axis}:${unitId}`;
    const set = new Set(this.state.pins);
    pinned ? set.add(key) : set.delete(key);
    this.state.pins = [...set];
    this.state.ledger.push({kind:pinned?'pin':'unpin', axis, unitId, revision:this.state.revision, at:new Date().toISOString()});
    return this.inspect();
  }

  history({limit=50}={}) { return clone(this.state.ledger.slice(-Math.max(1,Math.min(200,limit)))); }

  restore({expectedRevision, revision}) {
    assertRevision(expectedRevision, this.state.revision);
    const snapshot = this.state.revisions.find((r) => r.revision === revision);
    if (!snapshot) throw new Error('REVISION_NOT_FOUND');
    return this.commit(snapshot.case, {kind:'restore', from:revision});
  }

  exportCase({expectedRevision}={}) {
    if (expectedRevision) assertRevision(expectedRevision, this.state.revision);
    const c = this.state.case;
    const safeJs = String(c.js).replace(/<\/script/gi, '<\\/script');
    return `<!doctype html><html><head><meta charset="utf-8"><style>${c.css}</style></head><body>${c.html}<script>${safeJs}</script></body></html>`;

  }
}
