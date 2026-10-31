const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../wireframes/model.js');

test('customers can see only their portal routes', () => {
  assert.equal(model.canAccess('customer','my-invoice'),true);
  assert.equal(model.canAccess('customer','invoice-detail'),false);
  assert.equal(model.canAccess('customer','staff-editor'),false);
  assert.equal(model.canAccess('staff','discount-editor'),false);
  assert.equal(model.canAccess('admin','discount-editor'),true);
});

test('password requires length, both letter cases, and a special character', () => {
  assert.deepEqual(model.passwordChecks('short'),[false,false,true,false]);
  assert.deepEqual(model.passwordChecks('LongEnough1!'),[true,true,true,true]);
});

test('subscription actions follow stage and plan permissions', () => {
  assert.deepEqual(model.subscriptionActions('draft',{},false),['quote']);
  assert.equal(model.nextSubscriptionStage('draft','quote'),'quotation');
  assert.equal(model.nextSubscriptionStage('quotation','confirm-subscription'),'confirmed');
  assert.equal(model.nextSubscriptionStage('confirmed','activate'),'active');
  assert.equal(model.nextSubscriptionStage('active','pause',{pause:false,renew:true,close:true}),null);
  assert.deepEqual(model.subscriptionActions('active',{pause:false,renew:true,close:false},true),['change-addons','renew']);
  assert.equal(model.nextSubscriptionStage('paused','resume'),'active');
  assert.equal(model.nextSubscriptionStage('active','close-subscription'),'closed');
  assert.deepEqual(model.subscriptionActions('closed',{},true),[]);
});

test('invoice totals include discount, tax, and partial payment', () => {
  const lines=[{unitPrice:1000,quantity:1},{unitPrice:200,quantity:2}];
  assert.deepEqual(model.invoiceTotals(lines,200,0.1,500),{subtotal:1400,discount:200,tax:120,total:1320,paid:500,due:820});
  assert.equal(model.invoiceTotals(lines,200,0.1,1320).due,0);
});

test('a repeated billing run skips invoices already created', () => {
  const subscriptions=[{id:'one',status:'active',due:true,valid:true},{id:'two',status:'quotation',due:true,valid:true},{id:'three',status:'active',due:true,valid:false}];
  const first=model.billingResults(subscriptions,new Set());
  assert.deepEqual([first.created,first.skipped,first.failed],[1,1,1]);
  const second=model.billingResults(subscriptions,new Set(['one']));
  assert.deepEqual([second.created,second.skipped,second.failed],[0,2,1]);
});

test('expired or exhausted discounts stop applying', () => {
  const rule={active:true,startsOn:'2026-01-01',endsOn:'2026-10-31',usageLimit:10,usageCount:9,minimumPurchase:1000,minimumQuantity:2};
  assert.equal(model.discountApplies(rule,'2026-10-31',1400,2),true);
  assert.equal(model.discountApplies(rule,'2026-11-01',1400,2),false);
  assert.equal(model.discountApplies({...rule,usageCount:10},'2026-10-31',1400,2),false);
  assert.equal(model.discountApplies(rule,'2026-10-31',900,2),false);
  assert.equal(model.discountApplies({...rule,scope:'products',productIds:['seats']},'2026-10-31',1400,2,['suite']),false);
  assert.equal(model.discountApplies({...rule,scope:'products',productIds:['seats']},'2026-10-31',1400,2,['seats']),true);
});
