import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { colorBgs } from './StickyNote';

const colorOptions = [
  { name: 'yellow', label: 'Yellow' },
  { name: 'blue', label: 'Blue' },
  { name: 'green', label: 'Green' },
  { name: 'pink', label: 'Pink' },
] as const;

interface NoteConfigPanelProps {
  content: string;
  color: string;
  onContentChange: (content: string) => void;
  onColorChange: (color: string) => void;
  onClose: () => void;
}

export function NoteConfigPanel({
  content,
  color,
  onContentChange,
  onColorChange,
  onClose,
}: NoteConfigPanelProps) {
  return (
    <div className="flex h-full w-80 min-h-0 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Sticky Note</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="note-content">Content</Label>
          <Textarea
            id="note-content"
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder="Write your note..."
            rows={6}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Colour</Label>
          <div className="flex gap-2">
            {colorOptions.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => onColorChange(c.name)}
                className={`h-8 w-8 rounded border-2 transition-transform ${
                  color === c.name
                    ? 'border-foreground scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: colorBgs[c.name] }}
                title={c.label}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
