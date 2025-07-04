# @xutl/forward

This is a simple port forwarding tool meant to be used with local VMs.

## Usage (CLI)

`npx @xutl/forward --host=<address> <source-port>:<target-port>`

In this use case `--host` is optional and is meant to be a local address to listen on. `source-port` is the local port to listen on and `target-port` is the port on `localhost` to forward to.

If `--host` is not a local address, then this will instelad listen on `localhost:<source-port>` and forward to `<host>:<target-port>`.

If `--host` is missing it will listen on all local addresses except `localhost`.

`<source-port>:<target-port>` can be simplified to just `<port>` for the case where they are identical.

## Usage (Programatic)

```typescript

import PortForward from '@xutl/forward';

// type EndPoint = { address: string, port: number };
const forward = new PortForward(listen: EndPoint, target: EndPoint);
forward.on('listening', ()=>{});
forward.on('connection', (client: EndPoint)=>{});
forward.on('disconnection', (client: EndPoint)=>{});
forward.on('close', ()=>{});
forward.on('error', (error: Error)=>{});
```