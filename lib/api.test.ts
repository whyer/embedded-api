import { Api } from './api'
import { Fetch, Headers, Response } from './types'

describe('api', () => {
  let fetch: jest.Mocked<Fetch>
  let response: jest.Mocked<Response>
  let headers: jest.Mocked<Headers>
  let clearCookies: jest.Mock
  let api: Api
  beforeEach(() => {
    headers = { get: jest.fn() }
    response = {
      json: jest.fn(),
      text: jest.fn(),
      blob: jest.fn(),
      ok: true,
      status: 200,
      statusText: 'ok',
      headers,
    }
    fetch = jest.fn().mockResolvedValue(response)
    clearCookies = jest.fn()
    api = new Api(fetch, clearCookies)
  })
  describe('#login', () => {
    it('rexposes token', async () => {
      const data = {
        token: '9462cf77-bde9-4029-bb41-e599f3094613',
        order: '5fe57e4c-9ad2-4b52-b794-48adef2f6663',
      }
      response.json.mockResolvedValue(data)

      const personalNumber = 'my personal number'
      const status = await api.login(personalNumber)

      expect(status.token).toEqual(data.token)
      status.cancel()
    })
    it('emits PENDING', async (done) => {
      const data = {
        token: '9462cf77-bde9-4029-bb41-e599f3094613',
        order: '5fe57e4c-9ad2-4b52-b794-48adef2f6663',
      }
      response.json.mockResolvedValue(data)
      response.text.mockResolvedValue('PENDING')

      const personalNumber = 'my personal number'
      const status = await api.login(personalNumber)

      status.on('PENDING', async () => {
        status.cancel()
        done()
      })
    })
    it('retries on PENDING', async (done) => {
      const data = {
        token: '9462cf77-bde9-4029-bb41-e599f3094613',
        order: '5fe57e4c-9ad2-4b52-b794-48adef2f6663',
      }
      response.json.mockResolvedValue(data)
      response.text.mockResolvedValueOnce('PENDING')
      response.text.mockResolvedValueOnce('OK')

      const personalNumber = 'my personal number'
      const status = await api.login(personalNumber)

      status.on('OK', () => {
        expect(fetch).toHaveBeenCalledTimes(4)
        done()
      })
    })
    it('sets session cookie', async (done) => {
      const data = {
        token: '9462cf77-bde9-4029-bb41-e599f3094613',
        order: '5fe57e4c-9ad2-4b52-b794-48adef2f6663',
      }
      response.json.mockResolvedValue(data)
      response.text.mockResolvedValue('OK')
      headers.get.mockReturnValue('cookie')

      const personalNumber = 'my personal number'
      await api.login(personalNumber)

      api.on('login', () => {
        expect(api.getSessionCookie()).toEqual('cookie')
        done()
      })
    })
  })
  describe('#logout', () => {
    it('clears cookies', async () => {
      await api.logout()
      expect(clearCookies).toHaveBeenCalled()
    })
    it('emits logout event', async () => {
      const listener = jest.fn()
      api.on('logout', listener)
      await api.logout()
      expect(listener).toHaveBeenCalled()
    })
    it('sets .isLoggedIn', async () => {
      api.isLoggedIn = true
      await api.logout()
      expect(api.isLoggedIn).toBe(false)
    })
  })
})