'use client';

// Text input for a server folder path, with a "Browse…" button that opens FolderPickerModal.

import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import FolderPickerModal from './FolderPickerModal';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  pickerTitle?: string;
  /** Folder to open when the value is empty. */
  startPath?: string;
}

export default function PathInput({ value, onChange, placeholder, required, className, pickerTitle, startPath }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={className ?? 'w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs text-gray-900 focus:border-blue-500 focus:outline-none'}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        <FolderOpen className="h-4 w-4" /> Browse…
      </button>
      <FolderPickerModal
        open={open}
        initialPath={value || startPath}
        title={pickerTitle}
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
