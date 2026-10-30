import type { ReactNode } from 'react'
import { SiteNav } from '../components/SiteNav'
import { SiteFooter } from '../components/SiteFooter'
import { SectionLabel } from '../components/ui'
import { usePageMeta } from '../hooks/hooks'

export interface LegalSection {
  id: string
  title: string
  body: ReactNode
}

const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

export function LegalPage({ label, title, intro, sections, metaTitle, metaDesc }: { label: string; title: string; intro: string; sections: LegalSection[]; metaTitle: string; metaDesc: string }) {
  usePageMeta(metaTitle, metaDesc)
  return (
    <>
      <SiteNav />
      <main id="main" className="min-h-screen pt-16">
        <article className="mx-auto max-w-[680px] px-4 py-16 md:py-24">
          <SectionLabel n="00">{label}</SectionLabel>
          <h1 className="headline mt-4 text-[44px] md:text-[64px]">{title}</h1>
          <p className="mt-4 font-mono text-[12px] uppercase tracking-[0.06em] text-ink-2">Last updated {today}</p>
          <p className="mt-8 text-[18px]">{intro}</p>
          <nav aria-label="Contents" className="card mt-10 p-5">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">Contents</p>
            <ol className="space-y-1.5">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-[15px] underline-offset-4 hover:text-route hover:underline">
                    <span className="mr-2 font-mono text-[11px] text-ink-2">{String(i + 1).padStart(2, '0')}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="mt-12 scroll-mt-24">
              <h2 className="text-[22px] font-bold">
                <span className="mr-3 font-mono text-[12px] font-normal text-ink-2">{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-[17px] [&_li]:ml-5 [&_li]:list-disc [&_a]:underline [&_a]:underline-offset-4">{s.body}</div>
            </section>
          ))}
        </article>
      </main>
      <SiteFooter />
    </>
  )
}
