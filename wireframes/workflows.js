/* Inspectable sample workflows. This file extends the approved static shell. */
const sampleQuery = new URLSearchParams(location.search);
let demoRole = ['admin', 'staff', 'customer'].includes(sampleQuery.get('role')) ? sampleQuery.get('role') : 'admin';
let failNext = sampleQuery.get('outcome') === 'error';
let subscriptionStage = ['draft', 'quotation', 'confirmed', 'active', 'paused', 'closed'].includes(sampleQuery.get('subscription')) ? sampleQuery.get('subscription') : 'active';
let invoiceStage = ['draft', 'confirmed', 'paid', 'cancelled'].includes(sampleQuery.get('invoice')) ? sampleQuery.get('invoice') : 'confirmed';
let invoiceOverdue = sampleQuery.get('invoice') === 'overdue';
let invoiceRecord = invoiceOverdue ? 'overdue' : 'standard';
const discountScenario=sampleQuery.get('discount');
const discountRule={active:true,startsOn:'2026-09-01',endsOn:discountScenario==='expired'?'2026-10-31':'2026-12-31',usageLimit:10,usageCount:discountScenario==='exhausted'?10:9,minimumPurchase:1000,minimumQuantity:2};
const invoiceDiscount=BrightloopModel.discountApplies(discountRule,'2026-11-01',1400,2)?200:0;
const invoiceBreakdown=BrightloopModel.invoiceTotals([{unitPrice:1000,quantity:1},{unitPrice:200,quantity:2}],invoiceDiscount,0.1);
const invoiceTotal=invoiceBreakdown.total;
let amountPaid = invoiceStage === 'paid' ? invoiceTotal : 0;
let billingRun = {status:'Ready', created:0, skipped:0, failed:0};
let billingRunRows = [];
const billedSubscriptionIds = new Set();
const dueSubscriptions=[{id:'SUB-1024',customer:'Northstar Labs',status:'active',due:true,valid:true},{id:'SUB-1023',customer:'Brightloop Bakery',status:'quotation',due:true,valid:true},{id:'SUB-1022',customer:'Acme Studio',status:'active',due:true,valid:false},{id:'SUB-1021',customer:'Moss & Co',status:'active',due:true,valid:true}];
rows.overdue=[['INV-2047','Brightloop Bakery','2026-10-15','1,320.00']];
rows.payments=[['PAY-882','INV-2046','Bank transfer','1,320.00']];
let invoiceSent = false;
let renewed = false;
let customerAddon = null;
let reportView = 'collections';
let reportFrom = '2026-08-01';
let reportTo = '2026-10-31';
let pickerMode = 'subscription';
const selectedByMode = {subscription:selectedProductIds, template:new Set(['suite-odoo']), discount:new Set(['seats'])};
const lineQuantities = new Map([['suite-odoo', 5]]);
const lifecycleHistory = [{stage:'Draft', detail:'Created by Sam Lee · 01 Oct 2026'}, {stage:'Quotation', detail:'Sent by Sam Lee · 02 Oct 2026'}, {stage:'Confirmed', detail:'Confirmed by Alex Morgan · 05 Oct 2026'}, {stage:'Active', detail:'Activated by Alex Morgan · 06 Oct 2026'}];
const reportMonths = [
  {label:'August', date:'2026-08-31', collected:190400, outstanding:45200, overdue:16},
  {label:'September', date:'2026-09-30', collected:221800, outstanding:41200, overdue:19},
  {label:'October', date:'2026-10-31', collected:248600, outstanding:38400, overdue:24}
];
const money = amount => Number(amount).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const flowButton = (label, action, primary=false) => `<button type="button" class="btn ${primary?'primary':''}" data-flow="${action}">${label}</button>`;
const stageLabel = stage => stage.charAt(0).toUpperCase() + stage.slice(1);

all.push({id:'billing-runs', title:'Billing runs', kind:'report', description:'Review invoices created for each due date.', motions:['Run progress keeps the counts visible.','Repeated runs show skipped invoices.','Failed rows remain available for retry.'], group:'Operations'});
navSections[0].ids.splice(3, 0, 'billing-runs');
navSections[3].ids=navSections[3].ids.filter(id=>id!=='sign-in');
navMeta['billing-runs'] = ['Billing runs', 'repeat'];
target['billing-runs'] = 'billing-runs';
const baseRender = render;
const baseNavigate = navigate;
const baseTable = table;
const baseDetail = detail;
const baseAuth = auth;
const baseFieldControl = fieldControl;
const baseOverlayForm = overlayForm;
const baseDashboard = dashboard;
const baseOpenMenu = openMenu;
const baseCloseMenu = closeMenu;
function syncSidebarButton(){
  const expanded=matchMedia('(max-width:860px)').matches?document.getElementById('app').classList.contains('nav-open'):!document.getElementById('app').classList.contains('sidebar-collapsed');
  for(const button of [document.getElementById('open-menu'),document.getElementById('mobile-menu-toggle')]){
    button.setAttribute('aria-expanded',String(expanded));
    button.setAttribute('aria-label',expanded?'Collapse navigation':'Expand navigation');
  }
}
openMenu=function(){baseOpenMenu();syncSidebarButton();document.getElementById('mobile-menu-toggle').focus();};
closeMenu=function(restore=true){const wasOpen=document.getElementById('app').classList.contains('nav-open');baseCloseMenu(false);syncSidebarButton();if(restore&&wasOpen)(matchMedia('(max-width:860px)').matches?document.getElementById('mobile-menu-toggle'):document.getElementById('open-menu')).focus();};
function toggleSidebar(){
  if(matchMedia('(max-width:860px)').matches){document.getElementById('app').classList.contains('nav-open')?closeMenu():openMenu();return;}
  document.getElementById('app').classList.toggle('sidebar-collapsed');syncSidebarButton();
}
window.addEventListener('resize',syncSidebarButton);

function routeAllowed(id) {
  return BrightloopModel.canAccess(demoRole,id);
}
render = function(id, updateHistory=true) {
  if (!routeAllowed(id)) {id = demoRole === 'customer' ? 'portal-home' : 'overview';history.replaceState({screen:id},'',`#${id}`);}
  baseRender(id, updateHistory);
  if (id === 'template-editor') renderModeLines('template');
  if (id === 'discount-editor') renderModeLines('discount');
  document.querySelectorAll('#nav .nav-group-wrap').forEach(group => {
    const label = group.querySelector('summary')?.textContent.trim();
    if (demoRole === 'customer') group.hidden = label !== 'Customer portal';
    else if (label === 'Customer portal' || (demoRole === 'staff' && label === 'Team access')) group.hidden = true;
  });
  document.querySelector('.avatar').textContent = ({admin:'AD',staff:'ST',customer:'CU'})[demoRole];
  document.querySelector('.avatar').setAttribute('aria-label', `${stageLabel(demoRole)} account`);
};
navigate = function(id, updateHistory=true) {
  if (current === 'overdue' && id === 'invoice-detail') selectInvoiceRecord('overdue');
  if (current === 'payments' && id === 'invoice-detail') selectInvoiceRecord('payment');
  if (!routeAllowed(id)) { showToast('This page is not available for your role'); return; }
  baseNavigate(id, updateHistory);
};
function selectInvoiceRecord(record){invoiceRecord=record;invoiceOverdue=record==='overdue';if(record==='overdue'){invoiceStage='confirmed';amountPaid=0;}if(record==='payment'){invoiceStage='paid';amountPaid=invoiceTotal;}}
function invoiceIdentity(){return invoiceRecord==='overdue'?{number:'INV-2047',customer:'Brightloop Bakery',email:'maya@bakery.example',issued:'01 Oct 2026',due:'15 Oct 2026'}:invoiceRecord==='payment'?{number:'INV-2046',customer:'Brightloop Bakery',email:'maya@bakery.example',issued:'01 Sep 2026',due:'15 Sep 2026'}:{number:'INV-2048',customer:'Northstar Labs',email:'ops@northstar.example',issued:'01 Nov 2026',due:'15 Nov 2026'};}

fields['product-editor'] = ['Product name','Type','Sales price','Cost price','Notes','Variants / price adjustment'];
fields['plan-editor'] = ['Plan name','Price','Billing interval','Minimum quantity','Available from','Available until','Auto close','Allow early close','Allow pause','Allow renewal'];
fields['discount-editor'] = ['Rule name','Type','Value','Minimum purchase','Minimum quantity','Start date','End date','Usage limit','Scope / products'];
fields['template-editor'] = ['Template name','Plan','Validity days','Product lines'];

fieldControl = function(label, index) {
  if (label === 'Variants / price adjustment') return `<div class="line-editor" id="f${index}"><div class="line-editor-head"><span>Variant</span><span>Brand</span><span>Price adjustment</span></div><div class="variant-rows"><div class="line-editor-row"><input aria-label="Variant name" placeholder="Name" value="Business Suite"><input aria-label="Variant brand" placeholder="Brand" value="Odoo"><input aria-label="Variant price adjustment" type="number" step="0.01" value="560"></div></div><button class="btn" type="button" data-add-variant>Add variant</button></div>`;
  if (label === 'Product lines') return `<div class="product-lines" id="f${index}"><div id="template-lines"></div><button class="btn add-products" type="button" data-open-picker="template">Add products</button></div>`;
  if (label === 'Scope / products') return `<div class="scope-control" id="f${index}"><select aria-label="Discount scope" id="discount-scope"><option value="subscription">Whole subscription</option><option value="products">Selected products</option></select><div id="discount-products" hidden><div id="discount-lines"></div><button class="btn" type="button" data-open-picker="discount">Select products</button></div></div>`;
  if (['Auto close','Allow early close','Allow pause','Allow renewal'].includes(label)) return `<select id="f${index}"><option value="yes">Allowed</option><option value="no">Not allowed</option></select>`;
  if (label === 'Product lines / taxes') return `<div class="product-lines" id="f${index}" role="group" aria-labelledby="f${index}-title"><div class="selected-lines" id="selected-product-lines"></div><button class="btn add-products" type="button" data-open-picker="subscription">Add products</button></div>`;
  return baseFieldControl(label, index);
};

function formError(form, control, message) {
  const field = control.closest('.field') || form;
  let error = field.querySelector('.field-error');
  if (!error) { error = document.createElement('span'); error.className = 'field-error'; field.append(error); }
  error.textContent = message;
  control.setAttribute('aria-invalid','true');
  if (!error.id) error.id = `field-error-${Math.random().toString(36).slice(2,8)}`;
  control.setAttribute('aria-describedby', error.id);
  control.focus();
}
function clearErrors(form) { form.querySelectorAll('.field-error,.form-error').forEach(node => node.remove()); form.querySelectorAll('[aria-invalid]').forEach(node => {node.removeAttribute('aria-invalid');node.removeAttribute('aria-describedby')}); }
function formBanner(form, message) { let banner = form.querySelector('.form-error'); if (!banner) { banner=document.createElement('p');banner.className='form-error wide';banner.setAttribute('role','alert');form.prepend(banner); } banner.textContent=message; banner.tabIndex=-1; banner.focus(); }
function busy(button, label, callback) { if (button.disabled) return; button.disabled=true;button.setAttribute('aria-busy','true');button.dataset.idle=button.innerHTML;button.innerHTML=`<span class="busy-label">${label}</span>`;setTimeout(() => {button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=button.dataset.idle;callback();}, 500); }
function simulatedFailure(form) { if (!failNext) return false; failNext=false; formBanner(form, 'Could not complete the action. Check the details and try again.'); return true; }

submitForm = function(event, destination) {
  event.preventDefault(); const form=event.currentTarget; clearErrors(form);
  if (current === 'subscription-editor' && !selectedProductIds.size) { formBanner(form,'Add at least one product.'); return; }
  if (current === 'discount-editor' && form.querySelector('#discount-scope')?.value === 'products' && !selectedByMode.discount.size) { formBanner(form,'Select at least one product.'); return; }
  if (current === 'template-editor' && !selectedByMode.template.size) { formBanner(form,'Add at least one product line.'); return; }
  const badNumber=[...form.querySelectorAll('input[type=number]')].find(control=>control.value && (Number(control.value)<0 || (/(quantity|days|limit)/i.test(control.closest('.field')?.querySelector('label')?.textContent||'') && Number(control.value)<1)));
  if (badNumber) {formError(form,badNumber,'Enter a positive value.');return;}
  const dates=[...form.querySelectorAll('input[type=date]')];
  if (dates.length>1 && dates[0].value && dates[1].value && dates[0].value>dates[1].value) {formError(form,dates[1],'End date must be on or after the start date.');return;}
  const required = [...form.querySelectorAll('input:not([type=hidden]), select')].filter(control => !control.closest('.line-editor') && !control.closest('.selected-tablewrap') && control.id !== 'discount-scope' && control.id !== 'f4');
  const firstEmpty = required.find(control => control.value === '' && !['Notes','Reference','Note','End date','Available until','Effective until','Quotation template'].includes(control.closest('.field')?.querySelector('label')?.textContent));
  if (firstEmpty) { formError(form, firstEmpty, 'Enter a value to continue.'); return; }
  const submit=form.querySelector('[type=submit]');
  busy(submit,'Working…',() => {if (simulatedFailure(form)) return; showToast(`${all.find(item=>item.id===current)?.title||'Changes'} reviewed`); navigate(destination);});
};

function renderModeLines(mode) {
  const host=document.getElementById(mode==='template'?'template-lines':'discount-lines'); if (!host) return;
  const chosen=catalogProducts.filter(product=>selectedByMode[mode].has(product.id));
  host.innerHTML=chosen.length ? `<div class="selected-tablewrap"><table><thead><tr><th>Product</th><th>Unit price</th>${mode==='template'?'<th>Quantity</th>':''}<th><span class="sr-only">Remove</span></th></tr></thead><tbody>${chosen.map(product=>`<tr><td>${product.name} · ${product.variant}</td><td class="mono">${product.price}</td>${mode==='template'?`<td><input type="number" min="1" step="1" value="${lineQuantities.get(product.id)||1}" data-template-qty="${product.id}" aria-label="Quantity for ${product.name}, ${product.variant}"></td>`:''}<td><button class="remove-line" type="button" data-remove-catalog="${product.id}" data-mode="${mode}" onclick="removeCatalogLine(this)" aria-label="Remove ${product.name}, ${product.variant}">${icon('close')}</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="line-empty">No products selected.</p>`;
}
function removeCatalogLine(button){selectedByMode[button.dataset.mode].delete(button.dataset.removeCatalog);renderModeLines(button.dataset.mode);}
function lineAmount(product, quantity) {return Number(product.price.replaceAll(',','')) * Number(quantity||1);}
renderSelectedProductLines = function() {
  const host=document.getElementById('selected-product-lines'); if (!host) return;
  const chosen=catalogProducts.filter(product=>selectedProductIds.has(product.id));
  host.innerHTML=chosen.length ? `<div class="selected-tablewrap"><table><thead><tr><th>Product</th><th>Unit price</th><th>Qty</th><th>Tax</th><th>Line amount</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>${chosen.map(product=>{const detail=lineDetails.get(product.id)||{};const qty=Number(detail.quantity)||1;const tax=detail.tax==='standard'?0.1:0.1;return `<tr><td><strong>${product.name}</strong><small>${product.variant}</small></td><td class="mono">${product.price}</td><td><input type="number" min="1" step="1" value="${qty}" data-product-qty="${product.id}" aria-label="Quantity for ${product.name}, ${product.variant}"></td><td><select data-product-tax="${product.id}" aria-label="Tax for ${product.name}, ${product.variant}"><option value="auto" ${detail.tax!=='standard'?'selected':''}>Auto · 10%</option><option value="standard" ${detail.tax==='standard'?'selected':''}>Standard · 10%</option></select></td><td class="mono" data-line-amount="${product.id}">${money(lineAmount(product,qty)*(1+tax))}</td><td><button type="button" class="remove-line" data-remove-product="${product.id}" onclick="removeProductLine(this)" aria-label="Remove ${product.name}, ${product.variant}">${icon('close')}</button></td></tr>`}).join('')}</tbody></table></div>` : `<p class="line-empty">No product lines selected. Add products to start this subscription.</p>`;
};

function openCatalogPicker(mode) {
  pickerMode=mode; pickerTrigger=document.activeElement;
  pickerDraft=new Set(mode==='subscription'?selectedProductIds:selectedByMode[mode]);
  const dialog=document.getElementById('product-picker');
  document.getElementById('product-picker-content').innerHTML=`<div class="picker-shell"><div class="picker-head"><div><div class="eyebrow">Product catalog</div><h2 id="product-picker-title">Select products</h2></div><button class="icon-btn" type="button" onclick="closeProductPicker()" aria-label="Close product selector">${icon('close')}</button></div><div class="picker-search"><label for="picker-search">Search products</label><div class="picker-search-control">${icon('search')}<input id="picker-search" type="search" autocomplete="off" placeholder="Name, SKU, or variant"><button type="button" class="picker-clear" data-clear-picker aria-label="Clear product search" hidden>${icon('close')}</button></div></div><p class="picker-result" id="picker-result">${catalogProducts.length} products</p><div class="picker-tablewrap"><table><thead><tr><th>Select</th><th>Product</th><th>Variant</th><th>Unit price</th></tr></thead><tbody>${catalogProducts.map(product=>`<tr data-picker-row data-search="${`${product.name} ${product.sku} ${product.variant}`.toLowerCase()}"><td><input type="checkbox" id="pick-${product.id}" data-picker-product="${product.id}" aria-label="Select ${product.name}, ${product.variant}" ${pickerDraft.has(product.id)?'checked':''}></td><td><label for="pick-${product.id}"><strong>${product.name}</strong><small>${product.sku}</small></label></td><td>${product.variant}</td><td class="mono">${product.price}</td></tr>`).join('')}</tbody></table></div><p class="picker-empty" hidden>No products match. Clear the search to see all products.</p><div class="picker-footer"><span id="picker-selected-count">${pickerDraft.size} selected</span><div class="actions"><button class="btn" type="button" onclick="closeProductPicker()">Cancel</button><button class="btn primary" type="button" data-apply-picker>Add selected</button></div></div></div>`;
  const search=dialog.querySelector('#picker-search');
  const filter=()=>{const q=search.value.trim().toLowerCase();let visible=0;dialog.querySelectorAll('[data-picker-row]').forEach(row=>{row.hidden=!row.dataset.search.includes(q);if(!row.hidden)visible++});dialog.querySelector('#picker-result').textContent=`${visible} product${visible===1?'':'s'} found`;dialog.querySelector('.picker-empty').hidden=visible>0;dialog.querySelector('[data-clear-picker]').hidden=!q;};
  search.addEventListener('input',filter);
  dialog.querySelector('[data-clear-picker]').addEventListener('click',()=>{search.value='';filter();search.focus()});
  dialog.querySelectorAll('[data-picker-product]').forEach(box=>box.addEventListener('change',()=>{box.checked?pickerDraft.add(box.dataset.pickerProduct):pickerDraft.delete(box.dataset.pickerProduct);dialog.querySelector('#picker-selected-count').textContent=`${pickerDraft.size} selected`;}));
  dialog.showModal();search.focus();
}
openProductPicker = function() {openCatalogPicker('subscription');};
applyProductPicker = function() {
  if (pickerMode==='subscription') {rememberLineDetails(); selectedProductIds=new Set(pickerDraft);selectedByMode.subscription=selectedProductIds;renderSelectedProductLines();}
  else {selectedByMode[pickerMode]=new Set(pickerDraft);renderModeLines(pickerMode);}
  closeProductPicker();
};

overlayForm = function(screen) {
  if (screen.id !== 'payment-entry') return baseOverlayForm(screen);
  return `<div class="editor-shell"><div class="editor-top"><div><div class="eyebrow">Billing</div><h2 id="editor-title">Record payment</h2><p>Invoice INV-2048 · Amount due ${money(invoiceTotal-amountPaid)}</p></div><button type="button" class="icon-btn" onclick="closeEditorOverlay()" aria-label="Close payment form">${icon('close')}</button></div><form novalidate class="formgrid editor-fields" onsubmit="submitOverlay(event)"><div class="field"><label for="overlay-invoice">Invoice</label><input id="overlay-invoice" value="INV-2048" readonly></div><div class="field"><label for="overlay-method">Payment method</label><select id="overlay-method"><option value="">Select method</option><option>Bank transfer</option><option>Card</option><option>Cash</option><option>Other</option></select></div><div class="field"><label for="overlay-amount">Amount</label><input id="overlay-amount" type="number" min="0.01" max="${invoiceTotal-amountPaid}" step="0.01" placeholder="Amount"></div><div class="field"><label for="overlay-date">Paid on</label><input id="overlay-date" type="date" value="2026-10-31"></div><div class="field"><label for="overlay-reference">Reference</label><input id="overlay-reference" placeholder="Reference"></div><div class="field wide"><label for="overlay-note">Note</label><input id="overlay-note" placeholder="Note"></div><div class="editor-actions wide"><div class="actions"><button class="btn" type="button" onclick="closeEditorOverlay()">Cancel</button><button class="btn primary" type="submit">Record payment</button></div></div></form></div>`;
};
const firstOverlayForm=overlayForm;
overlayForm=function(screen){const markup=firstOverlayForm(screen);return screen.id==='payment-entry'?markup.replaceAll('INV-2048',invoiceIdentity().number):markup;};
submitOverlay = function(event) {
  event.preventDefault();const form=event.currentTarget;clearErrors(form);
  if (form.closest('#editor-dialog')?.querySelector('#editor-title')?.textContent !== 'Record payment') {
    const fields=[...form.querySelectorAll('input,select')];
    const blank=fields.find(field=>!field.value && !/until/i.test(field.closest('.field')?.querySelector('label')?.textContent||''));
    if(blank){formError(form,blank,'Enter a value to continue.');return;}
    const email=fields.find(field=>/email/i.test(field.closest('.field')?.querySelector('label')?.textContent||''));
    if(email && /^(alex|sam|maya)@/i.test(email.value)){formError(form,email,'This email already has an account.');return;}
    const password=fields.find(field=>field.type==='password');
    if(password && !(password.value.length>8&&/[A-Z]/.test(password.value)&&/[a-z]/.test(password.value)&&/[^A-Za-z0-9]/.test(password.value))){formError(form,password,'Use more than eight characters, uppercase, lowercase, and a special character.');return;}
    busy(form.querySelector('[type=submit]'),'Working…',()=>{if(simulatedFailure(form))return;closeEditorOverlay();showToast('Details reviewed');});return;
  }
  const method=form.querySelector('#overlay-method'), amount=form.querySelector('#overlay-amount');
  if (!method.value) {formError(form,method,'Select a payment method.');return;}
  if (!(Number(amount.value)>0) || Number(amount.value)>invoiceTotal-amountPaid) {formError(form,amount,`Enter an amount from 0.01 to ${money(invoiceTotal-amountPaid)}.`);return;}
  busy(form.querySelector('[type=submit]'),'Working…',()=>{if(simulatedFailure(form))return;amountPaid+=Number(amount.value);invoiceStage=amountPaid>=invoiceTotal?'paid':'confirmed';closeEditorOverlay();render('invoice-detail',false);showToast(invoiceStage==='paid'?'Invoice paid':'Partial payment recorded');});
};

function subscriptionActions(own) {
  const allowPause=sampleQuery.get('pause')!=='no', allowRenew=sampleQuery.get('renew')!=='no', allowClose=sampleQuery.get('close')!=='no';
  const labels={quote:'Quote','confirm-subscription':'Confirm',activate:'Activate','change-addons':'Change add-ons',pause:'Pause',resume:'Resume',renew:'Renew','close-subscription':'Close'};
  return BrightloopModel.subscriptionActions(subscriptionStage,{pause:allowPause,renew:allowRenew,close:allowClose},own).map(action=>flowButton(labels[action],action,['quote','confirm-subscription','activate'].includes(action))).join('');
}
function subscriptionDetail(screen) {
  const own=screen.id.startsWith('my-'), status=stageLabel(subscriptionStage);
  const chosen=[catalogProducts[1],catalogProducts[2]];
  const actions=subscriptionActions(own);
  const history=lifecycleHistory.filter((entry,index)=>index <= ({draft:0,quotation:1,confirmed:2,active:3,paused:3,closed:3})[subscriptionStage] || index>=4);
  if (subscriptionStage==='paused'&&!history.some(entry=>entry.stage==='Paused')) history.push({stage:'Paused',detail:'Current billing state'});
  if (subscriptionStage==='closed'&&!history.some(entry=>entry.stage==='Closed')) history.push({stage:'Closed',detail:'Current stage'});
  const permissionNames=[sampleQuery.get('pause')!=='no'?'Pause':null,sampleQuery.get('close')!=='no'?'Early close':null,sampleQuery.get('renew')!=='no'?'Renewal':null].filter(Boolean).join(' · ')||'None';
  const products=customerAddon?[...chosen,catalogProducts.find(product=>product.id===customerAddon)]:chosen;
  return `${head(screen,actions?`<div class="actions">${actions}</div>`:'')}<div class="grid metric-strip">${metric('Subscription status',status,'SUB-1024')}${metric('Next billing',subscriptionStage==='paused'||subscriptionStage==='closed'?'—':'01 Nov','Growth monthly')}${metric('Billing interval','Monthly','14 day payment terms')}</div><div class="split"><div><div class="panel"><div class="panelhead"><h2>Subscription terms</h2><span class="pill">${status}</span></div><div class="keyvals"><div><small>Subscription</small><strong>SUB-1024</strong></div><div><small>Customer</small><strong>${own?'Your account':'Northstar Labs'}</strong></div><div><small>Start date</small><strong>01 Oct 2026</strong></div><div><small>Expiry date</small><strong>${renewed?'30 Sep 2028':'30 Sep 2027'}</strong></div><div><small>Plan permissions</small><strong>${permissionNames}</strong></div></div></div><div class="panel"><div class="panelhead"><h2>Product lines</h2></div><div class="tablewrap"><table><thead><tr><th>Product</th><th>Unit price</th><th>Qty</th><th>Tax</th><th>Line amount</th></tr></thead><tbody>${products.map(product=>`<tr><td>${product.name} · ${product.variant}</td><td class="mono">${product.price}</td><td>1</td><td>10%</td><td class="mono">${money(lineAmount(product,1)*1.1)}</td></tr>`).join('')}</tbody></table></div></div><div class="panel"><div class="panelhead"><h2>Linked invoices</h2>${button('View all',own?'my-invoices':'invoices')}</div><div class="tablewrap"><table><thead><tr><th>Invoice</th><th>Issued</th><th>Status</th></tr></thead><tbody><tr tabindex="0" data-go="${own?'my-invoice':'invoice-detail'}"><td>INV-2048</td><td>01 Nov 2026</td><td>${stageLabel(invoiceStage)}</td></tr></tbody></table></div></div></div><div class="panel"><h2>Lifecycle history</h2><div class="timeline">${history.map(entry=>`<div><strong>${entry.stage}</strong><small>${entry.detail}</small></div>`).join('')}</div><div class="note">Sample record</div></div></div>`;
}
function invoiceDetail(screen) {
  const own=screen.id.startsWith('my-');
  const status=invoiceOverdue&&invoiceStage==='confirmed'?'Overdue':stageLabel(invoiceStage);
  const due=invoiceStage==='cancelled'?0:invoiceTotal-amountPaid;
  const actions=own?`${flowButton('Download PDF','pdf')}`:`${invoiceStage==='draft'?flowButton('Confirm','confirm-invoice',true):''}${invoiceStage==='confirmed'?flowButton('Send','send-invoice')+flowButton('Record payment','payment-entry',true):''}${invoiceStage!=='cancelled'?flowButton('Download PDF','pdf'):''}${['draft','confirmed'].includes(invoiceStage)&&amountPaid===0?flowButton('Cancel','cancel-invoice'):''}`;
  return `${head(screen,`<div class="actions">${actions}</div>`)}<div class="grid metric-strip">${metric('Invoice status',status,'INV-2048')}${metric('Total',money(invoiceTotal),'Includes tax')}${metric('Amount due',money(due),amountPaid?'After payment':'Due 15 Nov')}</div><div class="split"><div><div class="panel"><div class="panelhead"><h2>Invoice summary</h2><span class="pill ${status==='Overdue'?'warn':''}">${status}</span></div><div class="keyvals"><div><small>Invoice</small><strong>INV-2048</strong></div><div><small>Customer</small><strong>${own?'Your account':'Northstar Labs'}</strong></div><div><small>Issued</small><strong>01 Nov 2026</strong></div><div><small>Due</small><strong>15 Nov 2026</strong></div></div></div><div class="panel"><div class="panelhead"><h2>Itemized charges</h2></div><div class="tablewrap"><table><thead><tr><th>Product</th><th>Unit price</th><th>Qty</th><th>Line amount</th></tr></thead><tbody><tr><td>Business Suite · Standard</td><td class="mono">1,000.00</td><td>1</td><td class="mono">1,000.00</td></tr><tr><td>Additional seats</td><td class="mono">200.00</td><td>2</td><td class="mono">400.00</td></tr></tbody></table></div><div class="invoice-totals"><div><span>Subtotal</span><strong class="mono">1,400.00</strong></div><div><span>Team seats discount</span><strong class="mono">−200.00</strong></div><div><span>Standard tax · 10%</span><strong class="mono">120.00</strong></div><div class="total"><span>Total</span><strong class="mono">1,320.00</strong></div><div><span>Payments</span><strong class="mono">−${money(amountPaid)}</strong></div><div class="total"><span>Amount due</span><strong class="mono">${money(due)}</strong></div></div></div><div class="panel"><div class="panelhead"><h2>Payments</h2></div>${amountPaid?`<div class="keyvals"><div><small>PAY-883 · Bank transfer</small><strong class="mono">${money(amountPaid)}</strong></div><div><small>Paid on</small><strong>31 Oct 2026</strong></div></div>`:'<p class="line-empty">No payments recorded.</p>'}</div></div><div class="panel"><h2>Invoice activity</h2><div class="timeline"><div><strong>Draft</strong><small>Created by billing run · 01 Nov 2026</small></div>${invoiceStage!=='draft'?`<div><strong>${status}</strong><small>${amountPaid?'Payment recorded · 31 Oct 2026':'Current stage'}</small></div>`:''}${invoiceSent?'<div><strong>Sent</strong><small>Delivery reviewed in this session</small></div>':''}</div><div class="note">Sample invoice</div></div></div>`;
}
const baseInvoiceDetail=invoiceDetail;
invoiceDetail=function(screen){
  const identity=invoiceIdentity();
  const html=baseInvoiceDetail(screen).replaceAll('INV-2048',identity.number).replaceAll('Northstar Labs',identity.customer).replaceAll('01 Nov 2026',identity.issued).replaceAll('15 Nov 2026',identity.due).replace('Due 15 Nov',invoiceOverdue?'Past due':`Due ${identity.due.slice(0,6)}`);
  if(invoiceDiscount)return html;
  const reason=discountScenario==='expired'?'Expired discount':'Usage limit reached';
  return html.replace('Team seats discount</span><strong class="mono">−200.00',`${reason}</span><strong class="mono">−0.00`)
    .replace('Standard tax · 10%</span><strong class="mono">120.00','Standard tax · 10%</span><strong class="mono">140.00')
    .replace('Total</span><strong class="mono">1,320.00','Total</span><strong class="mono">1,540.00');
};
detail = function(screen) {
  if (screen.id==='subscription-detail'||screen.id==='my-subscription') return subscriptionDetail(screen);
  if (screen.id==='invoice-detail'||screen.id==='my-invoice') return invoiceDetail(screen);
  return baseDetail(screen);
};

table = function(screen) {
  const html=baseTable(screen);
  if (screen.id==='invoices') return html.replace('<div class="panel">', `<div class="actions table-actions">${button('Billing runs','billing-runs')}</div><div class="panel">`).replace('aria-label="Open INV-2048"','data-invoice-record="standard" aria-label="Open INV-2048"').replace('aria-label="Open INV-2047"','data-invoice-record="overdue" aria-label="Open INV-2047"');
  if (demoRole==='staff' && ['products','plans','tax-rules','discounts'].includes(screen.id)) return html.replace(/<button type="button" class="btn primary" data-go="[^"]+">Create new[\s\S]*?<\/button>/,'').replace(/tabindex="0" data-go="[^"]+" aria-label="[^"]+"/g,'').replace(' · Select a row to open it.','');
  return html;
};

function billingRuns(screen) {
  return `${head(screen,flowButton('Run billing','run-billing',true))}<div class="grid metric-strip">${metric('Created',String(billingRun.created),'New invoices')}${metric('Skipped',String(billingRun.skipped),'Already billed or not due')}${metric('Failed',String(billingRun.failed),'Review and retry')}</div><div class="panel"><div class="panelhead"><h2>31 Oct 2026 run</h2><span class="pill ${billingRun.failed?'warn':''}" id="run-status">${billingRun.status}</span></div><div class="tablewrap"><table><thead><tr><th>Subscription</th><th>Customer</th><th>Result</th><th>Invoice</th></tr></thead><tbody>${!billingRunRows.length?'<tr><td colspan="4">No run yet. Run billing to review due subscriptions.</td></tr>':billingRunRows.map(row=>`<tr><td>${row.id}</td><td>${dueSubscriptions.find(subscription=>subscription.id===row.id)?.customer||'—'}</td><td>${row.result==='failed'?'Failed · catalog item unavailable':row.result==='skipped'?'Skipped · already billed or not due':'Created'}</td><td>${row.result==='created'?(row.id==='SUB-1024'?'INV-2048':'INV-2049'):'—'}</td></tr>`).join('')}</tbody></table></div>${billingRun.failed?`<div class="actions table-actions">${flowButton('Retry failed','retry-billing')}</div>`:''}</div>`;
}
function filteredReport() {return reportMonths.filter(month=>month.date>=reportFrom && month.date<=reportTo);}
function reportPanel() {
  const months=filteredReport();
  if (!months.length) return '<div class="panel"><p class="line-empty">No report data in this date range. Choose a different range.</p></div>';
  const key=reportView==='collections'?'collected':reportView==='outstanding'?'outstanding':'overdue';
  const label=reportView==='collections'?'Collected':reportView==='outstanding'?'Outstanding':'Overdue invoices';
  const max=Math.max(...months.map(month=>month[key]));
  return `<div class="split"><div class="panel"><div class="panelhead"><h2>${label} over time</h2></div><div class="reportbars">${months.map(month=>`<div class="bar"><span>${month.label}</span><i><b style="--bar-width:${month[key]/max*100}%"></b></i><span class="mono">${key==='overdue'?month[key]:money(month[key])}</span></div>`).join('')}</div></div><div class="panel"><div class="panelhead"><h2>${label} details</h2></div><div class="tablewrap"><table><thead><tr><th>Period</th><th>Collected</th><th>Outstanding</th><th>Overdue</th></tr></thead><tbody>${months.map(month=>`<tr><td>${month.label}</td><td class="mono">${money(month.collected)}</td><td class="mono">${money(month.outstanding)}</td><td>${month.overdue} invoices</td></tr>`).join('')}</tbody></table></div></div></div>`;
}
report = function(screen) {
  if (screen.id==='billing-runs') return billingRuns(screen);
  const months=filteredReport();const latest=months.at(-1);
  return `${head(screen,button('View overdue invoices','overdue','primary'))}<div class="toolbar report-toolbar"><div class="field"><label for="report-from">From</label><input id="report-from" type="date" value="${reportFrom}"></div><div class="field"><label for="report-to">To</label><input id="report-to" type="date" value="${reportTo}"></div></div><div class="grid metric-strip">${metric('Active subscriptions','1,284','Current')}${metric('Collected',latest?money(latest.collected):'—',latest?.label||'No data')}${metric('Outstanding',latest?money(latest.outstanding):'—',latest?.label||'No data')}</div><div class="report-tabs" role="group" aria-label="Report view">${['collections','outstanding','overdue'].map(view=>`<button type="button" class="btn ${reportView===view?'active':''}" data-report-view="${view}" onclick="setReportView(this.dataset.reportView)" aria-pressed="${reportView===view}">${view==='overdue'?'Overdue invoices':stageLabel(view)}</button>`).join('')}</div>${reportPanel()}`;
};
function setReportView(view){reportView=view;render('reports',false);}
dashboard = function(screen) {return baseDashboard(screen).replace(/<div class="note">Illustrative figures for layout review\. No financial data is connected\.<\/div>/,'');};

function passwordRules(input) {
  const value=input.value;
  const checks=['More than 8 characters','Uppercase letter','Lowercase letter','Special character'].map((label,index)=>[label,BrightloopModel.passwordChecks(value)[index]]);
  const host=input.closest('.field').querySelector('.password-rules');
  if(host) host.innerHTML=checks.map(([label,valid])=>`<span class="${valid?'met':''}">${valid?'✓':'○'} ${label}</span>`).join('');
  return checks.every(([,valid])=>valid);
}
auth = function(screen) {
  const html=baseAuth(screen);
  const wrapper=document.createElement('div');wrapper.innerHTML=html;
  const form=wrapper.querySelector('form');
  const inputs=[...form.querySelectorAll('input')];
  inputs.forEach((input,index)=>{
    const label=input.closest('.field').querySelector('label').textContent;
    if(label==='Email') input.type='email';
    if(label.includes('password') || label.includes('Password')) {
      input.autocomplete=screen.id==='register'?'new-password':screen.id==='reset'?'new-password':'current-password';
      input.insertAdjacentHTML('afterend',`<button type="button" class="password-toggle" data-toggle-password="${index}" aria-label="Show ${label.toLowerCase()}">Show</button>`);
      if(screen.id==='register'||screen.id==='reset') input.insertAdjacentHTML('afterend','<div class="password-rules" aria-live="polite"><span>○ More than 8 characters</span><span>○ Uppercase letter</span><span>○ Lowercase letter</span><span>○ Special character</span></div>');
    }
  });
  if(screen.id==='forgot') form.querySelector('button[type=submit]').textContent='Send reset link';
  return wrapper.innerHTML;
};
submitAuth = function(event,id) {
  event.preventDefault();const form=event.currentTarget;clearErrors(form);
  const input=[...form.querySelectorAll('input')];
  const name=input.find(field=>field.closest('.field').querySelector('label').textContent==='Name');
  const email=input.find(field=>field.type==='email');
  const passwords=input.filter(field=>field.type==='password'||field.type==='text'&&field.closest('.field').querySelector('label').textContent.toLowerCase().includes('password'));
  if(name && !name.value.trim()) {formError(form,name,'Enter your name.');return;}
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {formError(form,email,'Enter a valid email address.');return;}
  if(id==='register' && /^(alex|sam|maya)@/i.test(email.value)) {formError(form,email,'This email already has an account. Sign in or reset your password.');return;}
  if((id==='register'||id==='reset') && !passwordRules(passwords[0])) {formError(form,passwords[0],'Use a password that meets every rule.');return;}
  if(id==='reset' && passwords[0].value!==passwords[1].value) {formError(form,passwords[1],'Passwords do not match.');return;}
  if(id==='sign-in' && (!passwords[0]?.value || passwords[0].value==='wrong')) {formError(form,passwords[0],'Check your email and password, then try again.');return;}
  busy(form.querySelector('[type=submit]'),'Working…',()=>{
    if(simulatedFailure(form))return;
    if(id==='forgot') {form.innerHTML='<div class="auth-confirm" role="status"><h2>Check your email</h2><p>If an account exists, a reset link is on its way.</p><button type="button" class="btn" data-go="sign-in">Back to sign in</button></div>';return;}
    if(id==='reset') {form.innerHTML='<div class="auth-confirm" role="status"><h2>Password set</h2><p>You can sign in with your new password.</p><button type="button" class="btn" data-go="sign-in">Sign in</button></div>';return;}
    if(id==='register') demoRole='customer';
    navigate(demoRole==='customer'?'portal-home':'overview');
  });
};

function actionSpec(action) {
  const list={
    quote:['Quote subscription','Send SUB-1024 as a quotation. It will remain valid for 30 days.'],
    'confirm-subscription':['Confirm subscription','Confirm quotation SUB-1024 for Northstar Labs.'],
    activate:['Activate subscription','Start billing for SUB-1024 on its plan schedule.'],
    pause:['Pause subscription','Pause billing for SUB-1024 until it is resumed.'],
    resume:['Resume subscription','Resume billing for SUB-1024 on its plan schedule.'],
    renew:['Renew subscription','Extend SUB-1024 under its renewal terms.'],
    'close-subscription':['Close subscription','Close SUB-1024. Future billing will stop.'],
    'change-addons':['Change add-ons','Add an eligible product to SUB-1024.'],
    'confirm-invoice':['Confirm invoice',`Confirm ${invoiceIdentity().number} and its itemized total of ${money(invoiceTotal)}.`],
    'cancel-invoice':['Cancel invoice',`Cancel ${invoiceIdentity().number}. Its balance will no longer be collectible.`],
    'send-invoice':['Send invoice',`Send ${invoiceIdentity().number} to ${invoiceIdentity().email}.`],
    'run-billing':['Run billing','Create invoices due on 31 Oct 2026. Already billed subscriptions will be skipped.'],
    'retry-billing':['Retry failed','Retry subscriptions that failed in the last billing run.'],
    pdf:['Download PDF',`Download ${invoiceIdentity().number} as a PDF.`]
  };
  return list[action]||[stageLabel(action), 'Review this action.'];
}
let reviewAction='';
function downloadInvoicePdf(){
  const identity=invoiceIdentity();
  const lines=['BRIGHTLOOP / SAMPLE INVOICE',`${identity.number}    ${identity.customer}`,`Issued ${identity.issued}    Due ${identity.due}`,'Business Suite  1 x 1000.00    1000.00','Additional seats  2 x 200.00     400.00','Subtotal                         1400.00',`Discount                         -${money(invoiceDiscount)}`,`Standard tax 10%                  ${money(invoiceBreakdown.tax)}`,`TOTAL                            ${money(invoiceTotal)}`,`Payments                         -${money(amountPaid)}`,`AMOUNT DUE                       ${money(invoiceStage==='cancelled'?0:invoiceTotal-amountPaid)}`];
  const quote=value=>`(${value.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)')})`;
  const stream=`BT /F1 12 Tf 50 770 Td 18 TL ${lines.map(line=>`${quote(line)} Tj T*`).join(' ')} ET`;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const start=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  const url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'}));
  const link=document.createElement('a');link.href=url;link.download=`${identity.number}-sample.pdf`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function showActionReview(action) {
  reviewAction=action;const [title,copy]=actionSpec(action);const dialog=document.getElementById('review-dialog');
  dialog.querySelector('.review-addon')?.remove();
  document.getElementById('dialog-title').textContent=title;
  document.getElementById('dialog-copy').textContent=copy;
  document.getElementById('dialog-close').textContent='Back';
  const confirm=document.getElementById('dialog-confirm');confirm.textContent=title;confirm.onclick=commitReview;
  dialog.querySelector('.review-error')?.remove();
  if(action==='change-addons') {
    document.getElementById('dialog-copy').insertAdjacentHTML('afterend',`<div class="field review-addon"><label for="addon-choice">Eligible add-on</label><select id="addon-choice"><option value="">Select an add-on</option><option value="analytics">Analytics add-on · 320.00</option><option value="support">Priority support · 400.00</option></select></div>`);
  }
  dialog.showModal();
  (['close-subscription','cancel-invoice'].includes(action)?document.getElementById('dialog-close'):confirm).focus();
}
function commitReview() {
  const dialog=document.getElementById('review-dialog');const confirm=document.getElementById('dialog-confirm');
  if(reviewAction==='change-addons' && !dialog.querySelector('#addon-choice')?.value) {let field=dialog.querySelector('#addon-choice');let error=dialog.querySelector('.review-error');if(!error){error=document.createElement('p');error.className='review-error';field.after(error);}error.textContent='Select an add-on to continue.';field.focus();return;}
  busy(confirm,'Working…',()=>{
    if(failNext){failNext=false;let error=dialog.querySelector('.review-error');if(!error){error=document.createElement('p');error.className='review-error';dialog.querySelector('.actions').before(error);}error.textContent='Could not complete the action. Try again.';error.setAttribute('role','alert');return;}
    const action=reviewAction;dialog.close();
    const next=BrightloopModel.nextSubscriptionStage(subscriptionStage,action,{pause:sampleQuery.get('pause')!=='no',renew:sampleQuery.get('renew')!=='no',close:sampleQuery.get('close')!=='no'});
    if(next){subscriptionStage=next;lifecycleHistory.push({stage:stageLabel(next),detail:`${stageLabel(next)} in this session · 31 Oct 2026`});}
    if(action==='renew'){renewed=true;lifecycleHistory.push({stage:'Renewed',detail:'Renewed in this session · 31 Oct 2026'});}
    if(action==='change-addons'){customerAddon=dialog.querySelector('#addon-choice')?.value||null;lifecycleHistory.push({stage:'Add-on changed',detail:'Change reviewed in this session · 31 Oct 2026'});}
    if(action==='confirm-invoice')invoiceStage='confirmed';
    if(action==='cancel-invoice')invoiceStage='cancelled';
    if(action==='send-invoice')invoiceSent=true;
    if(action==='run-billing'||action==='retry-billing'){
      const subscriptions=action==='retry-billing'?dueSubscriptions.filter(subscription=>billingRunRows.some(row=>row.id===subscription.id&&row.result==='failed')).map(subscription=>({...subscription,valid:true})):dueSubscriptions;
      const results=BrightloopModel.billingResults(subscriptions,billedSubscriptionIds);
      billingRunRows=results.rows;
      results.rows.filter(row=>row.result==='created').forEach(row=>billedSubscriptionIds.add(row.id));
      billingRun={status:results.failed?'Needs review':'Complete',created:results.created,skipped:results.skipped,failed:results.failed};
    }
    if(action==='pdf') downloadInvoicePdf();
    render(current,false);
    showToast(({quote:'Quotation sent','confirm-subscription':'Subscription confirmed',activate:'Subscription activated',pause:'Subscription paused',resume:'Subscription resumed',renew:'Subscription renewed','close-subscription':'Subscription closed','change-addons':'Add-on change reviewed','confirm-invoice':'Invoice confirmed','cancel-invoice':'Invoice cancelled','send-invoice':'Invoice send reviewed','run-billing':'Billing run complete','retry-billing':'Failed invoices retried',pdf:'PDF downloaded'})[action]||'Action complete');
  });
}

document.addEventListener('click',event=>{
  const flow=event.target.closest('[data-flow]');
  if(flow){if(flow.dataset.flow==='payment-entry'){openEditorOverlay('payment-entry');return;}showActionReview(flow.dataset.flow);return;}
  const picker=event.target.closest('[data-open-picker]');if(picker){openCatalogPicker(picker.dataset.openPicker);return;}
  if(event.target.closest('[data-apply-picker]')){applyProductPicker();return;}
  const variant=event.target.closest('[data-add-variant]');if(variant){const rows=variant.parentElement.querySelector('.variant-rows');rows.insertAdjacentHTML('beforeend','<div class="line-editor-row"><input aria-label="Variant name" placeholder="Name"><input aria-label="Variant brand" placeholder="Brand"><input aria-label="Variant price adjustment" type="number" step="0.01" value="0"></div>');rows.lastElementChild.querySelector('input').focus();return;}
  const toggle=event.target.closest('[data-toggle-password]');if(toggle){const input=toggle.parentElement.querySelector('input');const visible=input.type==='text';input.type=visible?'password':'text';toggle.textContent=visible?'Show':'Hide';toggle.setAttribute('aria-label',`${visible?'Show':'Hide'} ${toggle.parentElement.querySelector('label').textContent.toLowerCase()}`);input.focus();return;}
});
document.addEventListener('click',event=>{const row=event.target.closest('[data-invoice-record]');if(row)selectInvoiceRecord(row.dataset.invoiceRecord);},true);
document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-invoice-record]'))selectInvoiceRecord(event.target.dataset.invoiceRecord);},true);
document.addEventListener('input',event=>{
  if(event.target.closest('.password-rules')?.previousElementSibling===event.target || event.target.closest('.authstage') && event.target.closest('.field')?.querySelector('.password-rules')) passwordRules(event.target);
  if(event.target.matches('[data-product-qty]')) {const product=catalogProducts.find(item=>item.id===event.target.dataset.productQty);const amount=event.target.closest('tr').querySelector('[data-line-amount]');if(product&&amount)amount.textContent=money(lineAmount(product,Math.max(1,Number(event.target.value)))*1.1);}
  if(event.target.matches('[data-template-qty]'))lineQuantities.set(event.target.dataset.templateQty,Math.max(1,Number(event.target.value)));
});
document.addEventListener('change',event=>{
  if(event.target.id==='discount-scope')document.getElementById('discount-products').hidden=event.target.value!=='products';
  if(event.target.id==='report-from'||event.target.id==='report-to'){reportFrom=document.getElementById('report-from').value;reportTo=document.getElementById('report-to').value;render('reports',false);}
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Tab'||!document.getElementById('app').classList.contains('nav-open'))return;
  const toggle=document.getElementById('mobile-menu-toggle');
  const nodes=[...document.querySelectorAll('#sidebar button,#sidebar summary')].filter(node=>node.getClientRects().length);
  if(event.shiftKey&&document.activeElement===toggle){event.preventDefault();nodes.at(-1)?.focus();}
  else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();toggle.focus();}
});
document.getElementById('review-dialog').addEventListener('close',()=>{const target=document.querySelector(`[data-flow="${reviewAction}"]`);target?.focus();});
render(location.hash.slice(1)||'overview',false);
syncSidebarButton();
