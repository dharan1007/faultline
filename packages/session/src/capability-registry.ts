import {
  CapabilityApprovalSchema,
  CapabilityDescriptorSchema,
  ProtocolError,
  type CapabilityApproval,
  type CapabilityDescriptor,
} from '@faultline/protocol';

export interface CapabilityApprovalContext {
  sessionId: string;
  sessionRevision: string;
  targetSnapshotId: string;
  planId: string;
  approval?: CapabilityApproval;
}

export interface CapabilityResolution {
  descriptor: CapabilityDescriptor;
  approvalId?: string;
}

const keyFor = (id: string, adapterId: string): string => `${adapterId}\u0000${id}`;
const descriptorFingerprint = (descriptor: CapabilityDescriptor): string => JSON.stringify(descriptor);

export class CapabilityRegistry {
  readonly #descriptors = new Map<string, CapabilityDescriptor>();

  register(input: CapabilityDescriptor): CapabilityDescriptor {
    const descriptor = CapabilityDescriptorSchema.parse(input);
    const key = keyFor(descriptor.id, descriptor.adapterId);
    const existing = this.#descriptors.get(key);
    if (!existing) {
      this.#descriptors.set(key, descriptor);
      return structuredClone(descriptor);
    }
    if (descriptorFingerprint(existing) !== descriptorFingerprint(descriptor)) {
      throw new ProtocolError('conflict', `Incompatible capability descriptor already registered: ${descriptor.adapterId}/${descriptor.id}`);
    }
    return structuredClone(existing);
  }

  resolve(id: string, adapterId: string, context?: CapabilityApprovalContext): CapabilityResolution {
    const descriptor = this.#descriptors.get(keyFor(id, adapterId));
    if (!descriptor) {
      throw new ProtocolError('capability_missing', `Capability is not registered: ${adapterId}/${id}`);
    }

    if (descriptor.safety !== 'destructive') return { descriptor: structuredClone(descriptor) };

    if (!context?.approval) {
      throw new ProtocolError('safety_approval_required', 'Destructive capability requires an exact bound approval', {
        details: { adapterId, capabilityId: id },
      });
    }

    const parsed = CapabilityApprovalSchema.safeParse(context.approval);
    const approval = parsed.success ? parsed.data : null;
    const matches = approval
      && approval.sessionId === context.sessionId
      && approval.sessionRevision === context.sessionRevision
      && approval.targetSnapshotId === context.targetSnapshotId
      && approval.adapterId === adapterId
      && approval.capabilityId === id
      && approval.planId === context.planId;

    if (!matches) {
      throw new ProtocolError('safety_approval_required', 'Destructive approval does not match the exact session revision, target, capability, and plan', {
        details: { adapterId, capabilityId: id },
      });
    }

    return { descriptor: structuredClone(descriptor), approvalId: approval.approvalId };
  }

  require(id: string, adapterId: string, context?: CapabilityApprovalContext): CapabilityDescriptor {
    return this.resolve(id, adapterId, context).descriptor;
  }

  list(adapterId?: string): CapabilityDescriptor[] {
    return [...this.#descriptors.values()]
      .filter((descriptor) => adapterId === undefined || descriptor.adapterId === adapterId)
      .map((descriptor) => structuredClone(descriptor))
      .sort((a, b) => a.adapterId.localeCompare(b.adapterId) || a.id.localeCompare(b.id));
  }
}
