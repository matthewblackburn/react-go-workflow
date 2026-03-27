import { json } from '@codemirror/lang-json';
import { sql } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo } from 'react';

const languages = {
  json: () => json(),
  sql: () => sql(),
} as const;

type Language = keyof typeof languages;

interface CodeViewerProps {
  value: string;
  language?: Language;
  maxHeight?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
}

const readOnlyTheme = EditorView.theme({
  '&': {
    fontSize: '12px',
    backgroundColor: 'transparent',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-content': {
    padding: '8px 0',
  },
  '&.cm-focused': {
    outline: 'none',
  },
});

const editableTheme = EditorView.theme({
  '&': {
    fontSize: '12px',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-content': {
    padding: '8px 0',
  },
});

export function CodeViewer({
  value,
  language = 'json',
  maxHeight = '200px',
  editable = false,
  onChange,
}: CodeViewerProps) {
  const extensions = useMemo(() => {
    const ext = [languages[language](), EditorView.lineWrapping];
    if (!editable) ext.push(EditorView.editable.of(false), readOnlyTheme);
    else ext.push(editableTheme);
    return ext;
  }, [language, editable]);

  return (
    <div className="rounded-md border bg-muted/30 overflow-hidden" style={{ maxHeight }}>
      <div className="overflow-y-auto" style={{ maxHeight }}>
        <CodeMirror
          value={value}
          extensions={extensions}
          onChange={onChange}
          basicSetup={{
            lineNumbers: false,
            foldGutter: true,
            highlightActiveLine: editable,
            bracketMatching: true,
            closeBrackets: editable,
            autocompletion: false,
          }}
          theme="dark"
        />
      </div>
    </div>
  );
}

/** Convenience wrapper for displaying JSON data */
export function JsonViewer({
  data,
  maxHeight = '200px',
}: {
  data: Record<string, any>;
  maxHeight?: string;
}) {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  return <CodeViewer value={formatted} language="json" maxHeight={maxHeight} />;
}
