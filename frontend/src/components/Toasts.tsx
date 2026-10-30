import { AnimatePresence, motion } from 'framer-motion'
import { dismissToast, useAppStore } from '../store/appStore'

const TONE = {
  info: 'border-ink bg-white text-ink',
  ok: 'border-route bg-white text-route',
  warn: 'border-amber bg-white text-amber',
  danger: 'border-signal bg-signal text-white',
}

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-[min(400px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2 md:bottom-auto md:left-auto md:right-4 md:top-[68px] md:translate-x-0" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={`float pointer-events-auto flex items-center gap-3 rounded-[4px] border border-l-4 px-3 py-2.5 text-[14px] leading-snug ${TONE[t.tone]}`}
          >
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run()
                  dismissToast(t.id)
                }}
                className="min-h-8 shrink-0 rounded-[4px] border border-current px-2.5 text-[13px] font-medium"
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
