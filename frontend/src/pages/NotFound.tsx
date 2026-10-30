import { SiteNav } from '../components/SiteNav'
import { LinkButton, SectionLabel } from '../components/ui'
import { usePageMeta } from '../hooks/hooks'

export default function NotFound() {
  usePageMeta('Page not found | MediRoute', 'This page does not exist.')
  return (
    <>
      <SiteNav />
      <main className="grid min-h-screen place-items-center px-4 pt-16">
        <div className="max-w-[560px]">
          <SectionLabel n="404">Wrong turn</SectionLabel>
          <h1 className="headline mt-4 text-[48px] md:text-[80px]">No road here.</h1>
          <p className="mt-4 text-[18px] text-ink-2">This page does not exist. The right route is one click away.</p>
          <LinkButton to="/" arrow className="mt-8">
            Back to home
          </LinkButton>
        </div>
      </main>
    </>
  )
}
