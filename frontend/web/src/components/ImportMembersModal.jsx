import React, { useMemo, useRef, useState } from 'react';
import { X, FileUp, Download, UploadCloud, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { fetchMemberImportTemplate, previewMemberImport, importMembersFromCsv } from '../api';

const MAX_FILE_BYTES = 1.5 * 1024 * 1024;

const ACTION_STYLES = {
  new: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  update: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  skip: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  error: 'bg-red-500/15 text-red-300 border-red-500/30'
};

const ACTION_LABELS = {
  new: 'Create',
  update: 'Update',
  skip: 'Skip',
  error: 'Error'
};

export default function ImportMembersModal({ onClose, onSuccess }) {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [duplicateMode, setDuplicateMode] = useState('update');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const lineCount = useMemo(() => csvText.split(/\r?\n/).filter(line => line.trim()).length, [csvText]);

  const readCsvFile = (file) => {
    if (!file) return;
    setError(null);
    setPreview(null);

    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError('Please choose a .csv file exported from Excel or Google Sheets.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is larger than 1.5 MB. Split it into smaller batches and import again.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ''));
      setFileName(file.name);
    };
    reader.onerror = () => setError('That file could not be read. Try exporting it again.');
    reader.readAsText(file);
  };

  const handleDownloadTemplate = async () => {
    setError(null);
    const result = await fetchMemberImportTemplate();
    if (!result.success) {
      setError(result.error || 'Unable to download the sample CSV.');
      return;
    }
    const url = URL.createObjectURL(new Blob([result.text], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'samrat_members_import_template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async () => {
    if (!csvText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await previewMemberImport(csvText, duplicateMode);
      if (result.success) {
        setPreview(result);
      } else {
        setPreview(null);
        setError(result.error || 'That CSV could not be read.');
      }
    } catch (err) {
      setError(err.message || 'Network error while reading the CSV.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await importMembersFromCsv(csvText, duplicateMode);
      if (result.success) {
        onSuccess?.(result);
        onClose();
      } else {
        setError(result.error || 'Import failed. No members were changed.');
        if (result.issues) setPreview(prev => (prev ? { ...prev, issues: result.issues } : prev));
      }
    } catch (err) {
      setError(err.message || 'Network error during import.');
    } finally {
      setBusy(false);
    }
  };

  const summary = preview?.summary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative my-8 text-slate-200">

        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Bulk Import Members</h3>
            <p className="text-xs text-slate-400">Upload a CSV, review the preview, then import in one transaction</p>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 text-xs">

          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              readCsvFile(event.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragging ? 'border-amber-400 bg-amber-500/10' : 'border-slate-700 bg-slate-950/40 hover:border-slate-500'
            }`}
          >
            <FileUp className="w-6 h-6 mx-auto mb-2 text-slate-400" />
            <p className="text-slate-300 font-semibold">Drop your CSV here or click to browse</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {fileName ? (
                <span className="text-amber-300 font-mono">{fileName}</span>
              ) : (
                'Excel / Google Sheets export · max 1.5 MB · up to 2000 rows'
              )}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => readCsvFile(event.target.files?.[0])}
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">Or paste CSV rows</label>
            <textarea
              value={csvText}
              onChange={(event) => { setCsvText(event.target.value); setPreview(null); }}
              rows={5}
              spellCheck={false}
              placeholder={'name,phone,email,plan_name,join_date,expiry_date,status\nArjun Patel,9876543210,arjun@gmail.com,Monthly Starter,15/06/2026,,Active'}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 font-mono text-[11px] text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
            />
            {lineCount > 1 && (
              <p className="text-[11px] text-slate-500 mt-1">{lineCount - 1} data row(s) detected.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">If the phone already exists</label>
              <select
                value={duplicateMode}
                onChange={(event) => { setDuplicateMode(event.target.value); setPreview(null); }}
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="update">Update the existing member</option>
                <option value="skip-existing">Skip the row</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3.5 py-2 mt-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              Sample CSV
            </button>
          </div>

          {preview?.availablePlans?.length > 0 && (
            <p className="text-[11px] text-slate-500">
              Plans in this CSV must match: {preview.availablePlans.join(' · ')}
            </p>
          )}

          {summary && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                {[
                  { key: 'total', label: 'Rows', tone: 'text-slate-200' },
                  { key: 'new', label: 'To create', tone: 'text-emerald-400' },
                  { key: 'update', label: 'To update', tone: 'text-amber-400' },
                  { key: 'skip', label: 'Skipped', tone: 'text-slate-400' },
                  { key: 'error', label: 'Errors', tone: 'text-red-400' }
                ].map((cell) => (
                  <div key={cell.key} className="bg-slate-900 border border-slate-800 rounded-lg py-2">
                    <div className={`text-lg font-bold ${cell.tone}`}>{summary[cell.key]}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{cell.label}</div>
                  </div>
                ))}
              </div>

              {preview.truncated && (
                <p className="text-[11px] text-amber-300">
                  Only the first {preview.maxRows} rows are read; {preview.ignoredRows} row(s) were left out.
                </p>
              )}

              {preview.issues?.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {preview.issues.map((issue) => (
                    <div key={`issue-${issue.row}`} className="flex items-start gap-2 text-[11px] text-slate-300">
                      <span className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 font-mono text-slate-400 shrink-0">
                        Row {issue.row}
                      </span>
                      <span>{issue.issues?.join(' ')}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="py-2 px-3">Row</th>
                      <th className="py-2 px-3">Member</th>
                      <th className="py-2 px-3">Plan</th>
                      <th className="py-2 px-3">Expiry</th>
                      <th className="py-2 px-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {preview.rows.map((row) => (
                      <tr key={`row-${row.row}`} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono text-slate-500">{row.row}</td>
                        <td className="py-2 px-3">
                          <div className="text-white font-semibold">{row.name || '—'}</div>
                          <div className="text-slate-500 font-mono">{row.phone || '—'}</div>
                        </td>
                        <td className="py-2 px-3 text-slate-300">{row.plan || '—'}</td>
                        <td className="py-2 px-3 text-slate-300 font-mono">{row.expiryDate || '—'}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${ACTION_STYLES[row.action]}`}>
                            {ACTION_LABELS[row.action]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
            {summary?.importable > 0 ? (
              <span className="flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                {summary.importable} row(s) ready to import
              </span>
            ) : (
              <span className="text-slate-500">Preview the file to see what will be imported</span>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              {!summary ? (
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={!csvText.trim() || loading}
                  className="px-5 py-2.5 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  {loading ? 'Checking...' : 'Check File'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={busy || summary.importable === 0}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4" />
                  {busy ? 'Importing...' : `Import ${summary.importable} Member(s)`}
                </button>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
