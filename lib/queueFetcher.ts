import AutoQueue from './queue'
import RoundRobinArray from './roundRobinArrray'

export interface QueueEntry {
  id : string
  queue : AutoQueue
}

export default class Fetcher {
  private queues: RoundRobinArray<QueueEntry>

  private currentRunningQueue : QueueEntry | undefined

  private changeChildFunc : (childId : string) => Promise<string>

  private scheduleTimeout: any

  verboseDebug: boolean = false

  constructor(changeChildFunc : (childId : string) => Promise<string>) {
    this.changeChildFunc = changeChildFunc
    this.queues = new RoundRobinArray(new Array<QueueEntry>())
  }

  public async fetch<T>(func : () => Promise<T>, id : string) : Promise<T> {
    if (!this.queues.array.some((e) => e.id === id)) {
      const newQueue = new AutoQueue(10)
      this.queues.add({ id, queue: newQueue })
    }

    const queueEntry = this.queues.array.find((e) => e.id === id)
    if (queueEntry === undefined) {
      throw new Error(`No queue found for id: ${id}`)
    }
    const promise = queueEntry.queue.enqueue(func, false)

    if (this.scheduleTimeout === undefined || this.scheduleTimeout === null) {
      this.scheduleTimeout = setTimeout(async () => this.schedule(), 2000)
    }

    return promise
  }

  public get Queues() { return this.queues.array }

  async schedule() {
    this.queues.array.forEach(({ id: childId, queue }) => this.debug(
      'Schedule status: ',
      childId, '=>', queue.getQueueInfo(),
    ))

    if (this.queues.size === 0) {
      this.debug('No queues created yet')
      return
    }

    if (this.currentRunningQueue === undefined) {
      this.debug('First run schedule')
      const firstQueue = this.queues.first
      await this.runNext(firstQueue)
      return
    }

    const nextToRun = this.findNextQueueToRun()

    if (nextToRun === undefined) {
      this.debug('Nothing to do right now')
      this.scheduleTimeout = null
      return
    }

    const { id: queueToPauseId, queue: queueToPause } = this.currentRunningQueue
    this.debug('Queue to pause', queueToPauseId.bold, queueToPause.getQueueInfo())

    queueToPause.pause()

    if (queueToPause.runningTaskCount === 0) {
      await this.runNext(nextToRun)
      return
    }

    this.debug('Queue is not idle, wating for it ...')

    queueToPause.getQueueStatus().once('IDLE', async () => {
      this.debug('Got IDLE from queue')
      await this.runNext(nextToRun)
    })
  }

  private async runNext(queueToRun : QueueEntry) {
    const { id: childId, queue } = queueToRun
    this.debug('About to run', childId, queue.getQueueInfo())

    this.debug('Initiating change child')
    await this.changeChildFunc(childId)
    this.debug('Change child done')
    this.currentRunningQueue = queueToRun

    this.scheduleTimeout = setTimeout(async () => this.schedule(), 2000)
    await queue.start()
  }

  private findNextQueueToRun() : QueueEntry | undefined {
    // Iterate all queues and look for next queue with work to do
    for (let i = 0; i < this.queues.size; i += 1) {
      const { id: childId, queue } = this.queues.next()

      // If queue has items to execute, return it
      if (queue.size > 0 || queue.runningTaskCount > 0) return { id: childId, queue }
    }

    // Nothing more to do
    return undefined
  }

  private debug(message : any, ...args : any[]) {
    if (this.verboseDebug) {
      console.debug(message, ...args)
    }
  }
}