import assert from 'node:assert/strict';
import test from 'node:test';
import {setup,request,checkout,verified,adverse,balance} from '../helpers/cowrieCommerce.mjs';
import {cowrieProducts} from '../../db/cowrieProducts.ts';

for(const key of ['cowrie_5_v1','cowrie_15_v1','cowrie_40_v1']) {
  test(`${key}: signed integration GBP fulfils once despite foreign presentment; exact GBP refund settles`,async()=>{
    const c=await setup();try{
      const order=await c.service.startOrder(request(c,key));
      const object={...checkout(order,key),presentment_details:{presentment_currency:'eur',presentment_amount:12345}};
      const event=await verified('checkout.session.completed',object);
      await c.service.webhook(event);await c.service.webhook(event);
      assert.equal(balance(c).purchased_balance,cowrieProducts[key].quantity);
      await assert.rejects(verified('checkout.session.completed',{...object,currency:'eur',amount_total:12345}),/mismatch/);
      await assert.rejects(verified('checkout.session.completed',{...object,amount_total:object.amount_total+1}),/mismatch/);
      await c.service.webhook(await verified('charge.refunded',adverse('pi_local_D_primary',cowrieProducts[key].amountMinor)));
      assert.equal(balance(c).purchased_balance,0);
      assert.equal(c.database.prepare("SELECT COUNT(*) n FROM cowrie_ledger WHERE entry_type='refund_reversal'").get().n,1);
    }finally{c.database.close();}
  });
}

for (const beforeCheckout of [false,true]) {
  test(`unreconciled converted dispute stays review-required; retries cannot restore value (early=${beforeCheckout})`,async()=>{
    const c=await setup();try{
      const order=await c.service.startOrder(request(c,'cowrie_15_v1'));
      const paid=await verified('checkout.session.completed',checkout(order,'cowrie_15_v1'));
      const disputed=await verified('charge.dispute.created',adverse('pi_local_D_primary',480,0));
      if(beforeCheckout) await c.service.webhook(disputed);
      await c.service.webhook(paid);
      await c.service.webhook(disputed);
      await c.service.webhook(disputed);
      await c.service.webhook(paid);
      assert.equal(c.database.prepare('SELECT state FROM commerce_orders WHERE public_order_reference=?').get(order.publicOrderReference).state,'review_required');
      assert.equal(balance(c).purchased_balance,0);
      const ledger=c.database.prepare('SELECT entry_type,COUNT(*) n,SUM(delta) delta FROM cowrie_ledger GROUP BY entry_type').all();
      if(beforeCheckout) assert.equal(ledger.length,0);
      else assert.deepEqual(ledger.map(x=>({...x})),[{entry_type:'purchase_credit',n:1,delta:15},{entry_type:'refund_reversal',n:1,delta:-15}]);
      assert.equal(c.database.prepare("SELECT COUNT(*) n FROM stripe_webhook_events WHERE processing_result!='review_required' OR processed_at IS NULL").get().n,0);
    }finally{c.database.close();}
  });
}
