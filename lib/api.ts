import { DateTime } from 'luxon'
import { EventEmitter } from 'events'
import {
  checkStatus,
  LoginStatusChecker,
} from './loginStatus'
import {
  AsyncishFunction,
  AuthTicket,
  CalendarItem,
  Child,
  Classmate,
  Fetch,
  MenuItem,
  NewsItem,
  Notification,
  RequestInit,
  ScheduleItem,
  User,
} from './types'
import * as routes from './routes'
import * as parse from './parse'
import wrap, { Fetcher, FetcherOptions } from './fetcher'
import * as fake from './fakeData'

const apiKeyRegex = /"API-Key": "([\w\d]+)"/gm;

const fakeResponse = <T>(data: T): Promise<T> => new Promise((res) => (
  setTimeout(() => res(data), 200 + Math.random() * 800)
))

export class Api extends EventEmitter {
  private fetch: Fetcher

  private personalNumber?: string

  private session?: RequestInit

  private clearCookies: AsyncishFunction

  public isLoggedIn: boolean = false

  public isFake: boolean = false

  constructor(fetch: Fetch, clearCookies: AsyncishFunction, options?: FetcherOptions) {
    super()
    this.fetch = wrap(fetch, options)
    this.clearCookies = clearCookies
  }

  getPersonalNumber() {
    return this.personalNumber
  }

  getSessionCookie() {
    return this.session?.headers?.Cookie
  }

  setSessionCookie(cookie: string) {
    this.session = {
      headers: {
        Cookie: cookie,
      },
    }

    this.isLoggedIn = true
    this.emit('login')
  }

  async login(personalNumber: string): Promise<LoginStatusChecker> {
    if (personalNumber.endsWith('1212121212')) return this.fakeMode()

    this.isFake = false

    const ticketUrl = routes.login(personalNumber)
    const ticketResponse = await this.fetch('auth-ticket', ticketUrl)
    const ticket: AuthTicket = await ticketResponse.json()

    // login was initiated - store personal number
    this.personalNumber = personalNumber

    const status = checkStatus(this.fetch, ticket)
    status.on('OK', async () => {
      const cookieUrl = routes.loginCookie
      const cookieResponse = await this.fetch('login-cookie', cookieUrl)
      const cookie = cookieResponse.headers.get('set-cookie') || ''
      this.setSessionCookie(cookie)
    })
    status.on('ERROR', () => { this.personalNumber = undefined })

    return status
  }

  async fakeMode(): Promise<LoginStatusChecker> {
    this.isFake = true

    setTimeout(() => {
      this.isLoggedIn = true
      this.emit('login')
    }, 50)

    const emitter: any = new EventEmitter()
    emitter.token = 'fake'
    return emitter
  }

  async getUser(): Promise<User> {
    if (this.isFake) return fakeResponse(fake.user())

    const url = routes.user
    const response = await this.fetch('user', url, this.session)
    const data = await response.json()
    return parse.user(data)
  }

  async getChildren(): Promise<Child[]> {
    if (this.isFake) return fakeResponse(fake.children())

    const startBundleResponse = await this.fetch('startBundle', routes.startBundle, this.session)
    const startBundleText = await startBundleResponse.text()

    const apiKeyMatches = apiKeyRegex.exec(startBundleText)
    const apiKey = apiKeyMatches && apiKeyMatches.length > 1 ? apiKeyMatches[1] : ''
    if (this.session) {
      this.session.headers = {
        ...this.session.headers,
        'API-Key': apiKey
      }
    }

    const cdnResponse = await this.fetch('cdn', routes.cdn, this.session)
    const cdn = await cdnResponse.text()

    const authResponse = await this.fetch('auth', routes.auth, this.session)
    const auth = await authResponse.text()

    const rawResponse = await this.fetch('createItem', cdn, {
      method: 'POST',

      headers: {
        'Accept': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
        'Cookie': this.getSessionCookie()
      },
      body: auth
    })
    const authData = await rawResponse.json();

    const url = routes.children
    const response = await this.fetch('children', url, {
      method: 'GET',
      headers: {
        ...this.session?.headers,
        'Accept': 'application/json;odata=verbose',
        'Auth': authData.token,
        'Cookie': this.getSessionCookie(),
        'Host': 'etjanst.stockholm.se',
        'Referer': 'https://etjanst.stockholm.se/Vardnadshavare/inloggad2/hem'
      }
    })

    const data = await response.json()
    return parse.children(data)
  }

  async getCalendar(child: Child): Promise<CalendarItem[]> {
    if (this.isFake) return fakeResponse(fake.calendar(child))

    const url = routes.calendar(child.id)
    const response = await this.fetch('calendar', url, this.session)
    const data = await response.json()
    return parse.calendar(data)
  }

  async getClassmates(child: Child): Promise<Classmate[]> {
    if (this.isFake) return fakeResponse(fake.classmates(child))

    const url = routes.classmates(child.sdsId)
    const response = await this.fetch('classmates', url, this.session)
    const data = await response.json()
    return parse.classmates(data)
  }

  async getSchedule(child: Child, from: DateTime, to: DateTime): Promise<ScheduleItem[]> {
    if (this.isFake) return fakeResponse(fake.schedule(child))

    const url = routes.schedule(child.sdsId, from.toISODate(), to.toISODate())
    const response = await this.fetch('schedule', url, this.session)
    const data = await response.json()
    return parse.schedule(data)
  }

  async getNews(child: Child): Promise<NewsItem[]> {
    if (this.isFake) return fakeResponse(fake.news(child))

    const url = routes.news(child.id)
    const response = await this.fetch('news', url, this.session)
    const data = await response.json()
    return parse.news(data)
  }

  async getNewsDetails(child: Child, item: NewsItem): Promise<any> {
    if (this.isFake) {
      return fakeResponse(fake.news(child).find((ni) => ni.id === item.id))
    }
    const url = routes.newsDetails(child.id, item.id)
    const response = await this.fetch(`news_${item.id}`, url, this.session)
    const data = await response.json()
    return parse.newsItemDetails(data)
  }

  async getMenu(child: Child): Promise<MenuItem[]> {
    if (this.isFake) return fakeResponse(fake.menu(child))

    const url = routes.menu(child.id)
    const response = await this.fetch('menu', url, this.session)
    const data = await response.json()
    return parse.menu(data)
  }

  async getNotifications(child: Child): Promise<Notification[]> {
    if (this.isFake) return fakeResponse(fake.notifications(child))

    const url = routes.notifications(child.sdsId)
    const response = await this.fetch('notifications', url, this.session)
    const data = await response.json()
    return parse.notifications(data)
  }

  async logout() {
    this.isFake = false
    this.session = undefined
    this.personalNumber = undefined
    this.isLoggedIn = false
    try { await this.clearCookies() } catch (_) { /* do nothing */ }
    this.emit('logout')
  }
}
