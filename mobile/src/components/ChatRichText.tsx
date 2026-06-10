import React, { useMemo } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

const BOLD = /\*\*([\s\S]+?)\*\*/g;

type Segment = { t: 'plain' | 'bold'; s: string };

function splitBoldMarkdown(text: string): Segment[] {
  const re = new RegExp(BOLD.source, BOLD.flags);
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ t: 'plain', s: text.slice(last, m.index) });
    }
    out.push({ t: 'bold', s: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ t: 'plain', s: text.slice(last) });
  }
  if (out.length === 0) {
    return [{ t: 'plain', s: text }];
  }
  return out;
}

type Props = {
  /** Texto con fragmentos en negrita con sintaxis `**así**` */
  text: string;
  style?: TextProps['style'];
  /** P.ej. solo `fontWeight: '700'`; el color hereda del contenedor. */
  boldStyle?: TextStyle;
};

/**
 * Muestra texto del chat con negritas markdown básicas (`**palabra**`).
 * El resto del mensaje se muestra tal cual, incluyendo saltos de línea.
 */
export function ChatRichText({ text, style, boldStyle }: Props) {
  const bold = useMemo(
    () => (boldStyle ?? { fontWeight: '700' }) as TextStyle,
    [boldStyle],
  );
  const segments = useMemo(() => splitBoldMarkdown(text), [text]);

  if (segments.length === 1 && segments[0].t === 'plain') {
    return <Text style={style}>{segments[0].s}</Text>;
  }

  return (
    <Text style={style}>
      {segments.map((seg, i) =>
        seg.t === 'bold' ? (
          <Text key={i} style={bold}>
            {seg.s}
          </Text>
        ) : (
          <Text key={i}>{seg.s}</Text>
        ),
      )}
    </Text>
  );
}
