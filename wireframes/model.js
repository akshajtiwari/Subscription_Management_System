/* Small, dependency-free rules shared by the mockup and its tests. */
const BrightloopModel = (() => {
  const subscriptionTransitions = {
    draft:{quote:'quotation'},
    quotation:{'confirm-subscription':'confirmed'},
    confirmed:{activate:'active'},
    active:{pause:'paused','close-subscription':'closed'},
    paused:{resume:'active','close-subscription':'closed'},
    closed:{}
  };
  function canAccess(role, route) {
    if (['sign-in','register','forgot','reset'].includes(route)) return true;
    if (role==='customer') return ['portal-home','my-subscriptions','my-subscription','my-invoices','my-invoice'].includes(route);
    if (route.startsWith('my-') || route==='portal-home') return false;
    if (role==='staff') return !['staff','staff-editor','product-editor','plan-editor','tax-editor','discount-editor'].includes(route);
    return role==='admin';
  }
  function nextSubscriptionStage(stage, action, permissions={pause:true,renew:true,close:true}) {
    if (action==='pause'&&!permissions.pause || action==='close-subscription'&&!permissions.close) return null;
    return subscriptionTransitions[stage]?.[action] || null;
  }
  function subscriptionActions(stage, permissions={pause:true,renew:true,close:true}, customer=false) {
    if (stage==='draft') return customer?[]:['quote'];
    if (stage==='quotation') return customer?[]:['confirm-subscription'];
    if (stage==='confirmed') return customer?[]:['activate'];
    if (stage==='closed') return [];
    return [customer&&stage==='active'?'change-addons':null,stage==='active'&&permissions.pause?'pause':null,stage==='paused'?'resume':null,permissions.renew?'renew':null,permissions.close?'close-subscription':null].filter(Boolean);
  }
  function passwordChecks(value) {
    return [value.length>8,/[A-Z]/.test(value),/[a-z]/.test(value),/[^A-Za-z0-9]/.test(value)];
  }
  function invoiceTotals(lines, discount, taxRate, payments=0) {
    const cents = value => Math.round(Number(value)*100);
    const subtotal=lines.reduce((sum,line)=>sum+cents(line.unitPrice)*line.quantity,0);
    const discounted=Math.max(0,subtotal-cents(discount));
    const tax=Math.round(discounted*taxRate);
    const total=discounted+tax;
    return {subtotal:subtotal/100,discount:cents(discount)/100,tax:tax/100,total:total/100,paid:cents(payments)/100,due:Math.max(0,total-cents(payments))/100};
  }
  function billingResults(subscriptions, billedIds) {
    const rows=subscriptions.map(subscription=>{
      const result=subscription.status!=='active'||!subscription.due||billedIds.has(subscription.id)?'skipped':subscription.valid?'created':'failed';
      return {id:subscription.id,result};
    });
    return {rows,created:rows.filter(row=>row.result==='created').length,skipped:rows.filter(row=>row.result==='skipped').length,failed:rows.filter(row=>row.result==='failed').length};
  }
  function discountApplies(rule, onDate, purchase, quantity, productIds=[]) {
    const scopeMatches=rule.scope!=='products'||rule.productIds.some(productId=>productIds.includes(productId));
    return rule.active && scopeMatches && onDate>=rule.startsOn && (!rule.endsOn||onDate<=rule.endsOn) && (!rule.usageLimit||rule.usageCount<rule.usageLimit) && purchase>=rule.minimumPurchase && quantity>=rule.minimumQuantity;
  }
  return {canAccess,nextSubscriptionStage,subscriptionActions,passwordChecks,invoiceTotals,billingResults,discountApplies};
})();
if (typeof module!=='undefined') module.exports=BrightloopModel;
