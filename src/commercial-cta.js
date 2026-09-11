const INTAKE_URL='https://tally.so/r/WOL5eP';

function validHttps(value){
  try{return new URL(value).protocol==='https:';}catch{return false;}
}

async function loadConfig(){
  try{
    const response=await fetch('/commercial-config.json',{cache:'no-store',credentials:'omit'});
    if(!response.ok)return null;
    const data=await response.json();
    return data&&typeof data==='object'?data:null;
  }catch{return null;}
}

async function mount(){
  const payment=document.querySelector('[data-commercial-payment]');
  const intake=document.querySelector('[data-commercial-intake]');
  if(intake)intake.href=INTAKE_URL;
  if(!payment)return;
  payment.setAttribute('aria-disabled','true');
  payment.textContent='Payment link issued after acceptance';
  const config=await loadConfig();
  if(!config||!validHttps(config.paymentUrl))return;
  payment.href=config.paymentUrl;
  payment.target='_blank';
  payment.rel='noopener noreferrer';
  payment.removeAttribute('aria-disabled');
  payment.textContent=`Pay securely${config.provider?` with ${config.provider}`:''}`;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
