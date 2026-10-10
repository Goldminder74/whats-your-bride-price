import { createServer as httpsServer } from "node:https";
import { createServer as httpServer } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp,readFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Closed loopback HTTPS proxy: real cookies/Origin/Fetch Metadata; no hosted calls. */
export async function privateProxy(hosts, handler) {
  const directory=await mkdtemp(join(tmpdir(),"wybp-native-https-"));
  const openssl=process.env.WYBP_TEST_OPENSSL || (process.platform==="win32"?"C:/Program Files/Git/usr/bin/openssl.exe":"openssl");
  const key=join(directory,"local-only.key"),cert=join(directory,"local-only.pem");
  await promisify(execFile)(openssl,["req","-x509","-newkey","rsa:2048","-nodes","-keyout",key,"-out",cert,"-days","1","-subj",`/CN=${hosts[0]}`,"-addext",`subjectAltName=${hosts.map(host=>`DNS:${host}`).join(",")}`],{windowsHide:true});
  const sockets=new Set();const errors=[];
  const server=httpsServer({key:await readFile(key),cert:await readFile(cert)},async(incoming,outgoing)=>{
    try{
      const host=(incoming.headers.host||"").replace(/:443$/,"");if(!hosts.includes(host)){outgoing.writeHead(403);outgoing.end();return;}
      const body=["GET","HEAD"].includes(incoming.method)?undefined:Buffer.concat(await Array.fromAsync(incoming));
      const response=await handler(new Request(`https://${host}${incoming.url}`,{method:incoming.method,headers:incoming.headers,body}));
      const headers=Object.fromEntries(response.headers);delete headers["content-encoding"];delete headers["content-length"];
      outgoing.writeHead(response.status,headers);outgoing.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){errors.push(error);outgoing.writeHead(500);outgoing.end("Local test proxy failed");}
  });
  server.on("connection",socket=>{sockets.add(socket);socket.once("close",()=>sockets.delete(socket));});
  server.listen(0,"127.0.0.1");await once(server,"listening");
  const proxy=httpServer((_request,response)=>{response.writeHead(403);response.end();});
  proxy.on("connect",(request,socket,head)=>{
    if(!hosts.some(host=>request.url===`${host}:443`)){socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");return;}
    const tunnel=connect(server.address().port,"127.0.0.1",()=>{socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");if(head.length)tunnel.write(head);socket.pipe(tunnel);tunnel.pipe(socket);});
    sockets.add(socket);sockets.add(tunnel);socket.once("close",()=>{sockets.delete(socket);tunnel.destroy();});tunnel.once("close",()=>{sockets.delete(tunnel);socket.destroy();});
    tunnel.on("error",()=>socket.destroy());socket.on("error",()=>tunnel.destroy());
  });
  proxy.listen(0,"127.0.0.1");await once(proxy,"listening");
  return {server:`http://127.0.0.1:${proxy.address().port}`,errors,async close(){for(const socket of sockets)socket.destroy();await Promise.all([new Promise(done=>server.close(done)),new Promise(done=>proxy.close(done))]);await rm(directory,{recursive:true,force:true});}};
}
