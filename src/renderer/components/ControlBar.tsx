import { motion, AnimatePresence } from 'motion/react'
import { Play } from 'lucide-react'

interface Props {
  processing: boolean
  cancelling: boolean
  paused: boolean
  onCancel: () => void
  onResume: () => void
}

export default function ControlBar({ paused, onResume }: Props) {
  return (
    <AnimatePresence>
      {paused && (
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
              onClick={onResume}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Play size={14} />
              继续处理
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
