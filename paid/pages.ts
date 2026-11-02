import { CANONICAL_ORIGIN, WAIVER_TEXT } from "./catalog.ts";

function page(title: string, body: string, index: boolean, path = "/"): string {
  const canonical = `${CANONICAL_ORIGIN}${path}`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="canonical" href="${canonical}"><meta property="og:title" content="What’s Your Bride Price?"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${CANONICAL_ORIGIN}/og-v2.png"><meta name="twitter:card" content="summary_large_image"><meta name="robots" content="${index ? "index,follow" : "noindex,nofollow"}"><style>
  :root{color-scheme:dark;--ink:#f6efe4;--bg:#1d120b;--card:#2a1b12;--line:#6b4a32;--gold:#f0a11a}
  body{margin:0;font:18px/1.5 Georgia,serif;background:var(--bg);color:var(--ink)}
  main{max-width:42rem;margin:auto;padding:1.5rem}
  a{color:var(--gold)} button,select,input{font:inherit} button{background:var(--gold);color:#1d120b;border:0;border-radius:999px;padding:.6rem 1rem;cursor:pointer}
  .card{background:var(--card);border:1px solid var(--line);border-radius:1rem;padding:1rem;margin:1rem 0}
  .warn{border-color:var(--gold)} .options{display:grid;gap:.5rem} .options button{background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:.8rem;text-align:left}
  label{display:block;margin:.6rem 0} footer nav{display:flex;flex-wrap:wrap;gap:.8rem}
  </style></head><body><main>${body}<footer class="card"><p>A playful culture score, never a measure of human worth.</p><nav aria-label="Legal"><a href="/">Game</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refunds">Refunds</a></nav><small>Draft legal wording. Not professionally approved or activated for production.</small></footer></main></body></html>`;
}

export function legalPage(kind: "privacy" | "terms" | "refunds"): string {
  const shared = `<aside class="card" role="note"><p><strong>Seller.</strong> Ayo Ayeni, trading as Classes for Culture.</p><p>Postal address: 35 Melrose Avenue, Borehamwood, Hertfordshire, WD6 2BH, United Kingdom.</p><p>Support: <a href="mailto:team@classesforculture.com">team@classesforculture.com</a>. No company number or VAT number is claimed.</p></aside>`;
  if (kind === "privacy") {
    return page("Draft Privacy Notice | What’s Your Bride Price?", `${shared}<h1>Privacy notice</h1><p>This draft describes the paid Cloudflare game. It is not an approved privacy notice.</p><h2>What the game stores</h2><ul><li>Play happens in your browser. A completed game writes a score summary and a sharded counter to Cloudflare KV. Ordinary play does not write to the database.</li><li>Purchases store an email address, country, order, Stripe reference and entitlement in Cloudflare D1 so a receipt can be sent and access can be unlocked or removed.</li><li>Card numbers stay with Stripe. This app does not store them.</li></ul><h2>Who processes data</h2><p>Cloudflare Workers serves the game and caches static assets at the edge. Stripe Checkout and Adaptive Pricing handle payment. Tax is not collected at launch, and the price shown is the final price. Receipts are sent by Resend or Postmark from a mail subdomain. Human support mail stays on Namecheap Private Email and is outside this application. Google Workspace, Google Drive and ChatGPT Sites are not part of this paid hosting path.</p><h2>Retention and rights</h2><p>Game summaries in KV are operational records for the party game. Orders are kept so refunds, disputes and statutory requests can be handled. UK and EU data-protection rights may include access, erasure and complaint to the ICO. Final retention periods and lawful bases are not approved in this draft.</p>`, false, "/privacy");
  }
  if (kind === "terms") {
    return page("Draft Terms | What’s Your Bride Price?", `${shared}<h1>Terms of use</h1><p>What’s Your Bride Price? is a culture quiz for adults aged 18 and over. The score is playful and is not a measure of a person.</p><h2>Free play and paid extras</h2><p>Completing a round is free everywhere. Cowrie bundles and Royal Reveal are one-off digital purchases and are not offered in the EU or in Iceland, Liechtenstein, or Norway yet. Prices shown are the final price. Stripe may present that price in the buyer's currency. Tax is not added.</p><h2>Instant digital content</h2><p>${WAIVER_TEXT}</p><p>That sentence is shown at checkout for UK, EU and EEA buyers and must be accepted before a Checkout Session is created. It is placeholder copy.</p><h2>Acceptable use</h2><p>Do not misuse the service, attempt to break payment checks, or present the score as a judgement of a person.</p>`, false, "/terms");
  }
  return page("Draft Refunds | What’s Your Bride Price?", `${shared}<h1>Refunds</h1><p>This refund page is placeholder copy for owner approval. It is not a live refund promise.</p><h2>Statutory withdrawal</h2><p>For UK, EU and EEA buyers, instant digital supply requires the checkout acknowledgement that the 14-day withdrawal right ends when supply starts. Faulty or misdescribed content still has its statutory remedies.</p><h2>Voluntary refunds</h2><p>A separate voluntary refund policy is not activated. If the owner later approves one, a full refund of a Cowrie bundle or Royal Reveal would return the amount Stripe charged, to the original payment method, and would remove the remaining value of that purchase without creating a debt or taking unrelated purchases.</p><h2>How to ask</h2><p>Paid purchases are not offered in the EU or in Iceland, Liechtenstein, or Norway yet. If a payment is taken for one of those countries, it is refunded to the original payment method and no pack is supplied. Email <a href="mailto:team@classesforculture.com">team@classesforculture.com</a> with the order reference from your receipt. The draft target is to acknowledge the request within two working days. Stripe refunds and disputes also update access automatically when the signed webhook arrives.</p>`, false, "/refunds");
}

export function playPageHtml(): string {
  return page("What’s Your Bride Price? | The Pan-African Party Game", `<h1>What’s Your Bride Price?</h1><p>Five regions. Twelve questions. One playful culture score. Completing a round is free. Cowries and Royal Reveal are optional one-off purchases.</p><section id="play" class="card" aria-live="polite"><p>Loading editions…</p></section><section id="shop" class="card" hidden><h2>Optional paid extras</h2><p id="access"></p><form id="checkout"><label>Product <select name="product" id="product"></select></label><label>Email <input name="email" type="email" autocomplete="email" required maxlength="200"></label><label>Country <select name="country" id="country" required></select></label><label><input name="adult" type="checkbox" value="yes" required> I confirm I am 18 or over.</label><label id="waiver-label" hidden><input name="waiver" type="checkbox" value="yes"> <span id="waiver-text"></span></label><button type="submit">Continue to Stripe Checkout</button><p id="shop-status" role="status"></p></form></section>
<script>
const play=document.querySelector("#play"),shop=document.querySelector("#shop");
const playerKey="wybp-player";
let player=localStorage.getItem(playerKey);
if(!player){player=crypto.randomUUID().replaceAll("-","").slice(0,32);localStorage.setItem(playerKey,player);}
const editions=()=>fetch("/api/paid/catalog").then(r=>r.json());
async function start(){
  const catalog=await editions();
  const product=document.querySelector("#product"),country=document.querySelector("#country");
  catalog.products.forEach(item=>{const option=document.createElement("option");option.value=item.key;option.textContent=item.name+" · "+item.displayPrice;product.append(option);});
  catalog.countries.forEach(item=>{const option=document.createElement("option");option.value=item.code;option.textContent=item.name;country.append(option);});
  document.querySelector("#waiver-text").textContent=catalog.waiverText;
  const waiverCountries=new Set(catalog.waiverCountries);
  const blockedCountries=new Set(catalog.blockedCountries||[]);
  const blockedMessage=catalog.purchaseBlockedMessage||"Purchases aren't available in your country yet. You can still play for free!";
  const waiverLabel=document.querySelector("#waiver-label");
  const submit=document.querySelector("#checkout button[type=submit]");
  const status=document.querySelector("#shop-status");
  function updatePurchaseAvailability(){
    const blocked=Boolean(catalog.purchasesBlocked)||blockedCountries.has(country.value);
    submit.disabled=blocked;
    waiverLabel.hidden=blocked||!waiverCountries.has(country.value);
    if(blocked) status.textContent=blockedMessage;
    else if(status.textContent===blockedMessage) status.textContent="";
  }
  country.addEventListener("change",updatePurchaseAvailability);
  updatePurchaseAvailability();
  play.innerHTML="<h2>Choose a region</h2>"+catalog.editions.map(item=>'<button type="button" data-edition="'+item.key+'">'+item.name+"</button>").join(" ");
  play.querySelectorAll("[data-edition]").forEach(button=>button.addEventListener("click",()=>round(button.dataset.edition)));
  document.querySelector("#checkout").addEventListener("submit",submitCheckout);
  shop.hidden=false;
  refreshAccess();
}
function escapeHtml(value){return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");}
async function round(edition){
  const questions=await (await fetch("/api/paid/questions?edition="+edition)).json();
  let index=0; const answers=[];
  const advance=()=>{index+=1; if(index<questions.length) ask(); else finish(edition,answers);};
  const ask=()=>{
    const question=questions[index];
    const multi=question.kind==="multi";
    play.innerHTML='<p>Question '+(index+1)+" of "+questions.length+"</p><h2>"+escapeHtml(question.prompt)+"</h2>"+(question.image?'<img alt="" src="'+question.image+'" width="320">':"")+'<div class="options">'+question.options.map((label,i)=>'<button type="button" data-choice="'+i+'">'+escapeHtml(label)+"</button>").join("")+(multi?'<button type="button" id="next">Submit selection</button>':"")+"</div>";
    const chosen=new Set();
    play.querySelectorAll("[data-choice]").forEach(button=>button.addEventListener("click",()=>{
      const choice=Number(button.dataset.choice);
      if(!multi){answers[index]=[choice];advance();return;}
      if(chosen.has(choice)) chosen.delete(choice); else chosen.add(choice);
      button.setAttribute("aria-pressed", chosen.has(choice)?"true":"false");
    }));
    const next=play.querySelector("#next");
    if(next) next.addEventListener("click",()=>{if(chosen.size===0) return; answers[index]=[...chosen]; advance();});
  };
  ask();
}
async function finish(edition,answers){
  const response=await fetch("/api/paid/games/complete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({edition,answers,playerId:player})});
  const result=await response.json();
  play.innerHTML="<h2>"+result.score+" / "+result.total+"</h2><p>"+escapeHtml(String(result.editionName||""))+"</p><p>"+escapeHtml((result.explanations||[]).map(item=>item.explanation).join(" "))+'</p><button type="button" id="again">Play another region</button>';
  document.querySelector("#again").addEventListener("click",start);
  refreshAccess();
}
async function refreshAccess(){
  const access=await (await fetch("/api/paid/access?player="+player)).json();
  document.querySelector("#access").textContent="Cowries on this browser: "+access.cowries+". Royal Reveal: "+(access.royal?"unlocked":"locked")+".";
}
async function submitCheckout(event){
  event.preventDefault();
  const data=new FormData(event.target);
  const status=document.querySelector("#shop-status");
  status.textContent="Opening checkout…";
  const response=await fetch("/api/paid/checkout",{method:"POST",headers:{"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify({productKey:data.get("product"),email:data.get("email"),country:data.get("country"),playerId:player,adult:data.get("adult")==="yes",waiver:data.get("waiver")==="yes"})});
  const payload=await response.json();
  if(!response.ok){status.textContent=payload.message||"Checkout is unavailable.";return;}
  location.href=payload.url;
}
start();
</script>`, true);
}

export function mockCheckoutHtml(orderId: string): string {
  return page("Test checkout", `<h1>Stripe test checkout</h1><p>No live charge is created. This page exists only when the Worker is in mock mode.</p><form method="post" action="/api/paid/mock-pay"><input type="hidden" name="orderId" value="${orderId}"><label>Test card <input value="4242 4242 4242 4242" readonly></label><button type="submit">Pay in test mode</button></form>`, false);
}

export function returnHtml(summary: string): string {
  return page("Payment return", `<h1>Payment</h1><p>${summary}</p><p><a href="/">Back to the game</a></p>`, false);
}
