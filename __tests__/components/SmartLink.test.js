import { render, screen } from '@testing-library/react'
import SmartLink from '@/components/SmartLink'

jest.mock('next/link', () => ({ href, children, ...props }) => (
  <a href={href} {...props}>
    {children}
  </a>
))

jest.mock('@/hooks/useHydrated', () => ({
  __esModule: true,
  default: jest.fn(() => true)
}))

jest.mock('@/lib/config', () => ({
  siteConfig: jest.fn(() => '')
}))

describe('SmartLink', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/article/test?theme=fuwari')
  })

  it('在 LINK 未配置时为相对链接保留主题参数', () => {
    render(<SmartLink href='/'>首页</SmartLink>)

    expect(screen.getByRole('link', { name: '首页' })).toHaveAttribute(
      'href',
      '/?theme=fuwari'
    )
  })

  it('不覆盖目标链接已有的查询参数', () => {
    render(<SmartLink href='/archive?theme=next'>归档</SmartLink>)

    expect(screen.getByRole('link', { name: '归档' })).toHaveAttribute(
      'href',
      '/archive?theme=next'
    )
  })
})
