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
