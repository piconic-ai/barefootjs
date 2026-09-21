import { describe, test, expect } from 'bun:test'
import { isStuckContainerResponse } from '../stuck-container-response'

describe('isStuckContainerResponse', () => {
  test('recognizes the stuck-instance 500 the Container class returns', () => {
    const body = 'Error proxying request to container: The container is not listening in the TCP address 10.0.0.1:8080'
    expect(isStuckContainerResponse(500, body)).toBe(true)
  })

  test('leaves a 500 the app itself produced alone', () => {
    expect(isStuckContainerResponse(500, '<h1>Internal Server Error</h1>')).toBe(false)
  })

  test('leaves the start-failure 500 alone -- that path already starts the container', () => {
    expect(isStuckContainerResponse(500, 'Failed to start container: Container failed to start')).toBe(false)
  })

  test('does not fire on a non-500 that happens to carry the text', () => {
    const body = 'The container is not listening in the TCP address 10.0.0.1:8080'
    expect(isStuckContainerResponse(200, body)).toBe(false)
  })
})
