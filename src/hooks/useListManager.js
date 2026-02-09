import { useState } from "react";

export default function useListManager(initial) {
  const [items, setItems] = useState(initial);
  const [editingIndex, setEditingIndex] = useState(null);

  const addOrUpdate = (item) => {
    if (editingIndex !== null) {
      setItems((prev) =>
        prev.map((x, idx) => (idx === editingIndex ? item : x))
      );
      setEditingIndex(null);
    } else {
      setItems((prev) => [...prev, item]);
    }
  };

  const remove = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const edit = (index) => {
    setEditingIndex(index);
    return items[index];
  };

  return {
    items,
    addOrUpdate,
    remove,
    edit,
    editingIndex,
  };
}
