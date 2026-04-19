/**
 * Strips dangerous elements and attributes from an HTML string before rendering.
 * Uses the browser's own DOM parser so the parsing behaviour matches the renderer.
 *
 * Allowed: structural/formatting tags (b, i, u, p, br, ul, ol, li, span, div, …)
 * Removed: <script>, <style>, <link>, <iframe>, <object>, <embed>, <form>
 * Removed: all event-handler attributes (on*), javascript: hrefs/srcs
 */
export function sanitizeHtml(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll('script,style,link,iframe,object,embed,form,meta,base').forEach(el => el.remove())
  div.querySelectorAll('*').forEach(el => {
    for (const { name, value } of [...el.attributes]) {
      if (/^on/i.test(name)) { el.removeAttribute(name); continue }
      if (/^(href|src|action)$/i.test(name) && /^\s*javascript:/i.test(value)) el.removeAttribute(name)
    }
  })
  return div.innerHTML
}
