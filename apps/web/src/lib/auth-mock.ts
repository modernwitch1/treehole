/**
 * Mock 模式下的客户端登录/登出工具。
 * 仅在浏览器端调用（客户端组件）。
 */

/** mock 模式下"登录" — 设置 session cookie。 */
export function mockLogin(): void {
  document.cookie = 'forum_session=mock; path=/; max-age=604800; SameSite=Lax';
}

/** mock 模式下"退出登录" — 删除 session cookie。 */
export function mockLogout(): void {
  document.cookie = 'forum_session=; path=/; max-age=0';
}
