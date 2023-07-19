import { DataConnection, Peer, PeerJSOption } from 'peerjs'
import initSqlJs from 'sql.js'

export type InitOptions = {
  sqlOptions?: any
  peerId?: string
  peerOptions: PeerJSOption
}

export async function init(opts?: InitOptions) {
  const sql = await initSqlJs(opts?.sqlOptions)
  const db = new sql.Database()

  const peer = opts?.peerId
    ? new Peer(opts.peerId, opts.peerOptions)
    : opts?.peerOptions
    ? new Peer(opts.peerOptions)
    : new Peer()

  return new PeerDB({ db, peer })
}

export class PeerDB {
  _db: any
  _peer: Peer

  connections = new Map<string, DataConnection>()

  constructor(opts: { db: any; peer: Peer }) {
    this._db = opts.db
    this._peer = opts.peer
  }

  connect(peerId: string) {
    const connection = this._peer.connect(peerId)
    this.connections.set(peerId, connection)

    connection.on('data', (data) => {
      if (typeof data !== 'object' || !data) return
      if (!('method' in data && 'args' in data && 'result' in data)) return
      const { method, args, result } = data as any
      const ourResult = this._db[method](...args)
      if (JSON.stringify(ourResult) !== JSON.stringify(result)) {
        console.warn('Mismatched results', ourResult, result)
      }
    })

    connection.on('close', () => {
      console.log('disconnected from', peerId)
      this.connections.delete(peerId)
    })
  }

  get db() {
    return new Proxy(this._db, {
      get: (target, method) => {
        return (...args: any[]) => {
          const result = target[method](...args)
          this.connections.forEach((connection) => {
            connection.send({ method, args, result })
          })
          return result
        }
      },
    })
  }
}
