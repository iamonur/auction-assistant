import { useState } from 'react'
import ItemDetailModal from '../components/ItemDetailModal'

interface UseItemDetailModal {
  openItem: (itemId: number) => void
  itemDetailModal: React.ReactNode
}

/** Local "click any item name to see its details" popup, shared across every page that lists items. */
export function useItemDetailModal(): UseItemDetailModal {
  const [itemId, setItemId] = useState<number | null>(null)

  return {
    openItem: setItemId,
    itemDetailModal: itemId !== null ? <ItemDetailModal itemId={itemId} onClose={() => setItemId(null)} /> : null
  }
}
