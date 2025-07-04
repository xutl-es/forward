#!/usr/bin/env node --experimental-strip-types --no-warnings

import * as Util from 'node:util';
import * as Net from 'node:net';
import * as Events from 'node:events';
import * as DNS from 'node:dns';
import * as OS from 'node:os';

export type EndPoint = {
	address: string;
	port: number;
};
export class PortForward extends Events.EventEmitter {
	#server: Net.Server;
	#sockets: Set<Net.Socket> = new Set();
	constructor(listen: EndPoint, destination: EndPoint) {
		super();
		this.#server = Net.createServer((socket) => {
			const remote = { address: socket.remoteAddress, port: socket.remotePort };
			this.emit('connection', remote);
			socket.on('close', () => this.emit('disconnection', remote));
			const other = Net.createConnection(destination.port, destination.address);
			this.#forward(socket, other);
		});
		this.#server
			.on('error', (err) => {
				this.#server.close();
				this.emit('error', err);
			})
			.on('close', () => {
				this.emit('close');
			})
			.on('listening', () => {
				this.emit('listening');
			})
			.listen(listen.port, listen.address);
	}
	#forward(one: Net.Socket, two: Net.Socket) {
		this.#sockets.add(one);
		this.#sockets.add(two);
		one.pipe(two);
		two.pipe(one);
		one
			.on('error', (e) => this.emit('error', e))
			.on('close', () => {
				this.#sockets.delete(one);
				this.emit('close');
			});
		two
			.on('error', (e) => this.emit('error', e))
			.on('close', () => {
				this.#sockets.delete(two);
				this.emit('close');
			});
	}
	close() {
		this.#server.close();
		for (const socket of this.#sockets.values()) {
			try {
				socket.end();
			} catch {}
		}
	}
}
export default PortForward;

async function main() {
	const { values: args, positionals: portsargs } = Util.parseArgs({
		options: {
			host: {
				type: 'string',
				short: 'a',
			},
		},
		allowPositionals: true,
	});
	const ports = portsargs
		.flatMap((item) => {
			const [source, target = source] = `${item}`.split(':').map((p) => +p.trim());
			if (!source || !target) return undefined;
			return { source, target };
		})
		.filter((x) => !!x);
	if (!ports.length) {
		console.error(`Usage: npx run @xutl/forward [--host=<address>] <source>:<target> [<source>:<target>...]`);
		process.exit(1);
	}

	const inits: [EndPoint, EndPoint][] = [];
	if (args.host) {
		const host = (await DNS.promises.lookup(args.host)).address;
		const local = Object.values(OS.networkInterfaces())
			.flat()
			.find((iface) => !iface?.internal && iface?.address === host);
		const sourceHost = local ? args.host : 'localhost';
		const targetHost = local ? 'localhost' : args.host;
		for (const address of await DNS.promises.lookup(sourceHost, { all: true })) {
			for (const { source, target } of ports) {
				const listen = { address: address.address, port: source };
				const destination = { address: targetHost, port: target };
				inits.push([listen, destination]);
			}
		}
	} else {
		for (const addr of Object.values(OS.networkInterfaces()).flat()) {
			if (!addr || addr.internal) continue;
			for (const { source, target } of ports) {
				const listen = { address: addr.address, port: source };
				const destination = { address: 'localhost', port: target };
				inits.push([listen, destination]);
			}
		}
	}

	const forwards = new Map<string, PortForward>();
	for (const [listen, target] of inits) setupForward(forwards, listen, target);

	const stop = () => {
		process.removeListener('SIGINT', stop);
		const fwds = forwards.values();
		forwards.clear();
		for (const fwd of fwds) fwd.close();
		Promise.resolve().then(() => process.exit());
	};
	process.on('SIGINT', stop);
}
function setupForward(forwards: Map<string, PortForward>, listen: EndPoint, destination: EndPoint) {
	let respawn = true;
	const id = `${listen.port}:${destination.port}`;
	const fwd = new PortForward(listen, destination);
	fwd
		.on('error', (err) => {
			if (['EADDRNOTAVAIL', 'EADDRINUSE'].includes(err.code)) {
				respawn = false;
				return;
			}
			console.error(`${id}`, err);
		})
		.on('close', () => {
			if (!forwards.size) return;
			forwards.delete(id);
			if (respawn) setupForward(forwards, listen, destination);
		})
		.on('listening', () => {
			console.log(`forwarding ${listen.address}:${listen.port} to ${destination.address}:${destination.port}`);
		})
		.on('connection', (client: EndPoint) => {
			console.log(
				`connected ${client.address}:${client.port} via ${listen.address}:${listen.port} to ${destination.address}:${destination.port}`,
			);
		});
	forwards.set(id, fwd);
}

if (process.argv[1] === import.meta.filename) main();
