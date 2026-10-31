"use client";
import {useEffect,useState} from 'react';
import {privatePostOptions} from './privatePost.ts';
export default function PurchaseConfirmationDownload({reference,ownerCredential}:Readonly<{reference:string;ownerCredential:string}>){
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{const controller=new AbortController();let objectUrl:string|undefined;void fetch('/commerce/confirmation',privatePostOptions({publicOrderReference:reference,anonymousSessionCredential:ownerCredential},controller.signal)).then(async response=>{if(!response.ok||!response.headers.get('content-type')?.startsWith('text/plain')){await response.body?.cancel();return;}const blob=await response.blob();if(controller.signal.aborted||blob.size>65536)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}).catch(()=>{});return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};},[reference,ownerCredential]);
 return url?<p><a href={url} download="classes-for-culture-purchase.txt">Save purchase confirmation</a></p>:null;
}
