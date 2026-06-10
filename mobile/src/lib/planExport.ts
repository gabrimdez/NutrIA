import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Directory, Paths } from 'expo-file-system';
import { Platform, Alert } from 'react-native';
import { DietPlan, TrainingPlan } from '../types';

/** Etiquetas de tipo de comida (export + UI del plan). */
export const MEAL_LABELS_FOR_PLAN: Record<string, string> = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
  snack: 'Snack',
};

/** Texto plano del plan (compartir / exportar). */
export function formatPlanForExport(plan: DietPlan): string {
  const lines: string[] = [];
  const label = plan.label ? ` — ${plan.label}` : '';
  lines.push(`🥗 Plan semanal v${plan.version}${label}`);
  lines.push(`Objetivo: ~${Math.round(plan.target_kcal).toLocaleString('es-ES')} kcal/día`);
  lines.push(
    `Macros: ${Math.round(plan.target_protein_g)}g prot · ${Math.round(plan.target_carbs_g)}g carbs · ${Math.round(plan.target_fat_g)}g grasas`,
  );
  lines.push('');
  for (const day of plan.days) {
    const dn = day.day_number ?? 0;
    const dayNames = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    lines.push(`━━ ${dayNames[dn] || day.day_label || `Día ${dn}`} ━━`);
    for (const meal of day.meals) {
      const mealLabel = MEAL_LABELS_FOR_PLAN[meal.meal_type] || meal.title || meal.meal_type;
      lines.push(`  ${mealLabel} (~${Math.round(meal.total_kcal || 0)} kcal)`);
      for (const food of meal.foods) {
        lines.push(`    • ${food.name} — ${Math.round(food.grams)}g`);
      }
    }
    lines.push('');
  }
  if (plan.rationale) {
    lines.push(`📝 Notas: ${plan.rationale}`);
  }
  return lines.join('\n');
}

/** Texto plano del plan de entrenamiento (compartir / exportar). */
export function formatTrainingPlanForExport(plan: TrainingPlan): string {
  const lines: string[] = [];
  lines.push(`💪 ${plan.name}`);
  lines.push('');

  for (const day of plan.days) {
    lines.push(`━━ ${day.name} ━━`);
    const nameW = Math.max(...day.exercises.map((e) => e.name.length), 10);
    lines.push(`${'Ejercicio'.padEnd(nameW)}  Series  Reps`);
    lines.push('─'.repeat(nameW + 16));
    for (const ex of day.exercises) {
      const sets = ex.sets > 0 ? String(ex.sets) : '-';
      lines.push(`${ex.name.padEnd(nameW)}  ${sets.padEnd(6)}  ${ex.reps}`);
    }
    lines.push('');
  }

  if (plan.focus_note) {
    lines.push(`📝 ${plan.focus_note}`);
    lines.push('');
  }
  if (plan.disclaimer) {
    lines.push(`⚠️ ${plan.disclaimer}`);
  }
  return lines.join('\n');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trainingPlanToHtml(plan: TrainingPlan): string {
  const dayBlocks = plan.days
    .map(
      (day) => `
    <div class="day-card">
      <div class="day-header">${escapeHtml(day.name)}</div>
      <table>
        <thead>
          <tr><th class="col-ex">Ejercicio</th><th class="col-s">Series</th><th class="col-r">Reps</th></tr>
        </thead>
        <tbody>
          ${day.exercises
            .map(
              (ex, i) =>
                `<tr class="${i % 2 === 0 ? 'even' : ''}"><td class="col-ex">${escapeHtml(ex.name)}</td><td class="col-s">${ex.sets > 0 ? ex.sets : '-'}</td><td class="col-r">${escapeHtml(ex.reps || '-')}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`,
    )
    .join('');

  const note = plan.focus_note
    ? `<div class="note">${escapeHtml(plan.focus_note)}</div>`
    : '';
  const disclaimer = plan.disclaimer
    ? `<div class="disclaimer">${escapeHtml(plan.disclaimer)}</div>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page{margin:16mm 12mm}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#fff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.4}
  .container{max-width:100%}
  .header{background:#10B981;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0}
  .header-title{font-size:18px;font-weight:700}
  .day-card{border:1px solid #E5E7EB;border-radius:6px;margin:14px 0;overflow:hidden;page-break-inside:avoid}
  .day-header{padding:8px 14px;background:#F3F4F6;border-bottom:1px solid #E5E7EB;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#374151}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th{padding:7px 14px;font-size:11px;color:#6B7280;text-align:left;border-bottom:2px solid #E5E7EB;font-weight:600}
  td{padding:8px 14px;font-size:13px;color:#1F2937;border-bottom:1px solid #F3F4F6;word-wrap:break-word;overflow-wrap:break-word}
  tr.even{background:#F9FAFB}
  .col-ex{width:60%}
  .col-s,.col-r{width:20%;text-align:center}
  th.col-s,th.col-r{text-align:center}
  .note{margin:14px 0;padding:12px 14px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;font-size:12px;color:#1E40AF;line-height:1.5}
  .disclaimer{margin:10px 0 0;padding:10px 14px;font-size:11px;color:#6B7280;border-top:1px solid #E5E7EB;line-height:1.4}
</style></head><body>
<div class="container">
  <div class="header"><span class="header-title">${escapeHtml(plan.name)}</span></div>
  ${dayBlocks}
  ${note}
  ${disclaimer}
</div>
</body></html>`;
}

async function exportPdfWeb(html: string, fileName: string): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    await html2pdf()
      .set({
        margin: [10, 8, 10, 8],
        filename: `${fileName}.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}

async function exportPdfNative(html: string, fileName: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const destDir = new Directory(Paths.cache, 'pdf_exports');
  if (!destDir.exists) {
    destDir.create({ intermediates: true });
  }
  const destFile = new File(destDir, `${fileName}_${Date.now()}.pdf`);
  const srcFile = new File(uri);
  srcFile.copy(destFile);

  if (Platform.OS === 'ios') {
    await new Promise((r) => setTimeout(r, 300));
  }

  await Sharing.shareAsync(destFile.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: fileName,
  });
}

export async function downloadTrainingPlanPdf(plan: TrainingPlan): Promise<void> {
  try {
    const html = trainingPlanToHtml(plan);
    const safeName = plan.name.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ _-]/g, '').trim() || 'rutina';

    if (Platform.OS === 'web') {
      await exportPdfWeb(html, safeName);
    } else {
      await exportPdfNative(html, safeName);
    }
  } catch (e: any) {
    Alert.alert('Error', e.message ?? 'No se pudo generar el PDF');
  }
}
