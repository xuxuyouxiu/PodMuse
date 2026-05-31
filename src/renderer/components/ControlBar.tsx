import { motion, AnimatePresence } from 'motion/react'
import { Square, Play, Loader2 } from 'lucide-react'

interface Props {
  processing: boolean
  cancelling: boolean
  paused: boolean
  onCancel: () => void
  onResume: () => void
}

export default function ControlBar({ processing, cancelling, paused, onCancel, onResume }: Props) {
  const visible = processing || cancelling || paused

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="control-bar"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
        >
          <div className="control-bar-group">
            <motion.button
              className="control-bar-primary"
              onClick={cancelling ? undefined : paused ? onResume : onCancel}
              disabled={cancelling}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {cancelling ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  停止中…
                </>
              ) : paused ? (
                <>
                  <Play size={14} />
                  继续处理
                </>
              ) : (
                <>
                  <Square size={14} />
                  停止处理
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
