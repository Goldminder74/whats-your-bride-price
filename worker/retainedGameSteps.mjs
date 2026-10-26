// Public request data only. Selecting the first displayed option is a valid
// answer, not privileged access to the correct-answer catalogue.
export function retainedGameStep(definition,state,step,credential,id){
 const incomplete=definition.flow==='incomplete',recover=definition.recover===true&&!incomplete;
 const count=incomplete?6:recover?24:16;if(step<0||step>=count)throw Error('retained_game_step');
 if(step===0)return {path:'/cowries/wallet',value:{anonymousSessionCredential:credential}};
 if(step===1)return {path:'/cowries/play',value:{anonymousSessionCredential:credential,region:definition.region,idempotencyKey:id},selection:true};
 if(recover&&step===9)return {path:'/questions/resume',value:{anonymousSessionCredential:credential,attemptId:state.selection.attemptId},selection:true};
 const answerIndex=recover&&step>=10&&step<=16?step-10:recover&&step>=17&&step<=21?step-10:step-2;
 if(step< (incomplete?6:recover?22:14)){
  const q=state.selection?.questions?.[answerIndex];if(!q?.options?.length)throw Error('retained_game_selection');
  return {path:'/questions/answer',value:{anonymousSessionCredential:credential,attemptId:state.selection.attemptId,questionRef:q.questionRef,selectedOptionIds:[q.options[0].id]},answer:true};
 }
 if(step===(recover?22:14))return {path:'/cowries/complete',value:{anonymousSessionCredential:credential,attemptId:state.selection.attemptId,idempotencyKey:id,avatarId:'adjoa',answers:state.selection.questions.map(q=>({questionStableId:q.questionRef,selectedOptionIds:[q.options[0].id]}))},completion:true};
 if(!/^[a-f0-9]{48}$/.test(state.resultSlug||''))throw Error('retained_game_result');
 return {path:'/',document:true};
}
export function retainedDayEntry(cursor,{incomplete=0,recoveries=0}={}){
 const mixed=incomplete===2150,total=mixed?7150:5000;if(!Number.isSafeInteger(cursor)||cursor<0||cursor>=total)throw Error('retained_day_cursor');
 const tail=cursor-7000,abandoned=mixed&&(cursor<7000?cursor%10>=7:tail%3===2);
 const index=!mixed?cursor:cursor<7000?Math.floor(cursor/10)*(abandoned?3:7)+cursor%10-(abandoned?7:0):abandoned?2100+Math.floor(tail/3):4900+Math.floor(tail/3)*2+tail%3;
 const recover=!abandoned&&recoveries===1000&&index%5===0;
 // Leave ten minutes before the24h boundary for the last starts to complete.
 const remainder=23*3600000-600000;
 return {flow:abandoned?'incomplete':'game',recover,maxSteps:abandoned?6:recover?24:16,offsetMs:Math.floor(abandoned?(index<215?index*3000000/215:3600000+(index-215)*remainder/1935):index<500?index*6000:3600000+(index-500)*remainder/4500)};
}
