import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Download,
  RefreshCw,
  CheckCircle2,
  Circle,
  ArrowUpDown,
  WifiOff,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Briefcase,
  History,
  Trash2,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon
} from 'lucide-react';

// --- Types ---
// Removed TypeScript interfaces


// --- Constants ---
const TARGET_URL = 'https://www.sarkariresultcm.in/latest-jobs/';

// --- Helper Functions ---

const parseDateString = (dateStr) => {
  try {
    // Handle dd/mm/yyyy
    let match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    }

    // Handle dd Month yyyy (e.g., 30 November 2025)
    match = dateStr.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
    if (match) {
      const monthMap = {
        'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
        'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
      };
      const monthStr = match[2].toLowerCase();
      const monthIndex = monthMap[monthStr];
      if (monthIndex !== undefined) {
        return new Date(parseInt(match[3]), monthIndex, parseInt(match[1]));
      }
    }

    return null;
  } catch (e) {
    return null;
  }
};

const calculateDaysLeft = (targetDate) => {
  if (!targetDate) return undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const d = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  const endOfTargetDay = new Date(d);
  endOfTargetDay.setHours(23, 59, 59, 999);

  const diffTime = endOfTargetDay.getTime() - today.getTime();
  const days = diffTime / (1000 * 60 * 60 * 24);
  return days < 0 ? Math.floor(days) : Math.ceil(days);
};

// --- Proxy Helper ---
const fetchWithFallback = async (targetUrl) => {
  try {
    const response = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
    if (response.ok) {
      const text = await response.text();
      if (text && text.length > 100) return text;
    }
  } catch (e) {
    console.warn("Primary proxy failed", e);
  }

  try {
    const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
    if (response.ok) {
      const data = await response.json();
      if (data.contents) return data.contents;
    }
  } catch (e) {
    console.warn("Secondary proxy failed", e);
  }

  throw new Error("Unable to load data. Please check connection.");
};

// --- Components ---

const StatusBadge = ({ days, status }) => {
  if (status === 'expired') {
    return <span className="px-2 py-1 rounded text-xs font-bold bg-red-900/50 text-red-200 border border-red-800">Expired</span>;
  }

  if (days === undefined) return <span className="text-gray-500">-</span>;

  const isUrgent = days < 5;
  return (
    <div className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg border ${isUrgent
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
      }`}>
      <span className="text-lg font-bold leading-none">{days}</span>
      <span className="text-[9px] uppercase tracking-wider opacity-70">Days</span>
    </div>
  );
};

const ActionButton = ({ href, type, label }) => {
  const icons = {
    apply: <ExternalLink className="w-3 h-3" />,
    notification: <FileText className="w-3 h-3" />,
    website: <Globe className="w-3 h-3" />,
    other: <LinkIcon className="w-3 h-3" />
  };

  const colors = {
    apply: 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20',
    notification: 'bg-slate-700 hover:bg-slate-600 text-slate-200',
    website: 'bg-slate-700 hover:bg-slate-600 text-slate-200',
    other: 'bg-gray-700 hover:bg-gray-600 text-gray-300'
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-md transition-all duration-200 whitespace-nowrap
        ${colors[type]}
      `}
      title={label}
    >
      {icons[type]}
      <span className="max-w-[120px] truncate">{label}</span>
    </a>
  );
};

// --- Main App ---

export default function App() {
  const [scrapedJobs, setScrapedJobs] = useState([]);
  const [appliedJobsMap, setAppliedJobsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'daysLeft', direction: 'asc' });
  const [showApplied, setShowApplied] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sarkari_applied_jobs_v2');
      if (saved) {
        setAppliedJobsMap(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load saved jobs", e);
    }
  }, []);

  const saveAppliedJobs = (newMap) => {
    setAppliedJobsMap(newMap);
    localStorage.setItem('sarkari_applied_jobs_v2', JSON.stringify(newMap));
  };

  const markAsApplied = (job) => {
    const newMap = {
      ...appliedJobsMap,
      [job.url]: {
        ...job,
        appliedDate: new Date().toISOString()
      }
    };
    saveAppliedJobs(newMap);
  };

  const removeApplied = (url) => {
    const newMap = { ...appliedJobsMap };
    delete newMap[url];
    saveAppliedJobs(newMap);
  };

  // --- Scraper ---

  const fetchMainPage = async () => {
    setLoading(true);
    setError(null);
    setProgress(10);
    setScrapedJobs([]);

    try {
      const htmlContent = await fetchWithFallback(TARGET_URL);
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');

      const allLinks = Array.from(doc.querySelectorAll('a'));
      const parsedJobs = [];
      const seenUrls = new Set();

      allLinks.forEach((link, index) => {
        const text = link.textContent?.trim() || '';
        const href = link.getAttribute('href');

        if (!href || text.length < 10 || seenUrls.has(href)) return;

        const lowerText = text.toLowerCase();
        const isLikelyJob = lowerText.includes('recruitment') || lowerText.includes('online form') || lowerText.includes('vacancy') || lowerText.includes('apply');
        if (!isLikelyJob) return;

        let dateStr = 'NA';
        let dateObj = null;

        const parentText = link.parentElement?.textContent || '';
        const dateMatch = parentText.match(/Last Date\s*[:|-]\s*(\d{2}\/\d{2}\/\d{4})/i) ||
          text.match(/Last Date\s*[:|-]\s*(\d{2}\/\d{2}\/\d{4})/i);

        if (dateMatch) {
          dateStr = dateMatch[1];
          dateObj = parseDateString(dateStr);
        }

        const daysLeft = calculateDaysLeft(dateObj);
        if (daysLeft !== undefined && daysLeft < 0) return;

        let fullUrl = href;
        if (href.startsWith('/')) {
          try { fullUrl = new URL(href, TARGET_URL).href; } catch (e) { }
        }

        seenUrls.add(fullUrl);

        parsedJobs.push({
          id: `job-${index}`,
          name: text.replace(/Last Date.*$/i, '').trim(),
          url: fullUrl,
          lastDate: dateStr,
          lastDateObj: dateObj ? dateObj.toISOString() : null,
          importantLinks: [],
          isDetailsLoaded: false,
          daysLeft: daysLeft,
          status: daysLeft !== undefined && daysLeft < 5 ? 'closing-soon' : 'active'
        });
      });

      if (parsedJobs.length === 0) throw new Error("No active jobs found.");

      setScrapedJobs(parsedJobs);
      setProgress(50);
      fetchDetailsBackground(parsedJobs);

    } catch (error) {
      console.error("Scraping failed:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMainPage();
  }, []);

  const fetchDetailsBackground = async (currentJobs) => {
    setLoadingDetails(true);
    const jobsToFetch = currentJobs.filter(j => !appliedJobsMap[j.url]);
    const total = jobsToFetch.length;
    let completed = 0;
    const BATCH_SIZE = 4;

    for (let i = 0; i < jobsToFetch.length; i += BATCH_SIZE) {
      const batch = jobsToFetch.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (job) => {
        if (job.isDetailsLoaded) return;

        try {
          const htmlContent = await fetchWithFallback(job.url);
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlContent, 'text/html');

          let updates = { isDetailsLoaded: true };

          if (job.lastDate === 'NA') {
            const bodyText = doc.body.textContent || '';

            // Priority 1: Check for "Extended" date
            let dateMatch = bodyText.match(/Extended\s*[:|-]?\s*(\d{1,2}\s+[a-zA-Z]+\s+\d{4}|\d{2}\/\d{2}\/\d{4})/i);

            // Priority 2: Look for "Last Date to Apply" specifically, or fallback to general "Last Date"
            if (!dateMatch) {
              dateMatch = bodyText.match(/Last Date\s*(?:to Apply)?\s*[:|-]\s*(\d{1,2}\s+[a-zA-Z]+\s+\d{4}|\d{2}\/\d{2}\/\d{4})/i);
            }

            if (dateMatch) {
              updates.lastDate = dateMatch[1];
              const d = parseDateString(dateMatch[1]);
              updates.lastDateObj = d ? d.toISOString() : null;
              updates.daysLeft = calculateDaysLeft(d);
            }
          }

          const extractedLinks = [];
          const rows = Array.from(doc.querySelectorAll('tr'));
          let startCapturing = false;

          rows.forEach(row => {
            const rowText = row.textContent?.toLowerCase() || '';

            // Logic: Only start capturing after seeing the "Important Links" header
            if (rowText.includes('important link')) {
              startCapturing = true;
              return; // Skip the header row itself
            }

            // If we haven't hit the header yet, check if this is a "rogue" table that doesn't use the header
            // But if we are in "strict" mode (implied by user request), we wait.
            // However, to be safe against pages WITHOUT headers, we can default to capture but filter heavily.
            // Current strategy: Wait for header. If no header found by end, we might run a fallback pass.

            if (!startCapturing) return;

            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const rawLabel = cells[0].textContent?.trim() || 'Link';
              const labelLower = rawLabel.toLowerCase();

              // Double check: If label looks like "WhatsApp" or "Telegram" or "Sarkari Result toolbox", ignore it
              if (labelLower.includes('whatsapp') || labelLower.includes('telegram') || labelLower.includes('instagram') || labelLower.includes('facebook') || labelLower.includes('join') || labelLower.includes('sarkari result toolbox')) {
                return;
              }

              const anchor = cells[1].querySelector('a');
              if (anchor && anchor.href) {
                let fullLink = anchor.getAttribute('href') || '';
                if (!fullLink.startsWith('http')) {
                  try { fullLink = new URL(fullLink, job.url).href; } catch (e) { }
                }

                let type = 'other';
                if (labelLower.includes('apply') || labelLower.includes('registration') || labelLower.includes('application')) {
                  type = 'apply';
                } else if (labelLower.includes('notification')) {
                  type = 'notification';
                } else if (labelLower.includes('official website')) {
                  type = 'website';
                }

                extractedLinks.push({
                  type,
                  label: rawLabel.replace(/:/g, '').trim(),
                  url: fullLink
                });
              }
            }
          });

          // Fallback: If strict parsing found NOTHING (maybe page has no header?), 
          // try loose parsing but exclude social junk
          if (extractedLinks.length === 0) {
            const allPageLinks = Array.from(doc.querySelectorAll('a'));
            allPageLinks.forEach(l => {
              const txt = l.textContent?.toLowerCase() || '';
              const href = l.getAttribute('href') || '';
              if (href.length < 5) return;

              // Exclude social
              if (txt.includes('whatsapp') || txt.includes('telegram') || href.includes('whatsapp.com') || href.includes('t.me')) return;

              if (txt.includes('apply online')) {
                extractedLinks.push({ type: 'apply', label: 'Apply Online', url: href });
              }
            });
          }

          updates.importantLinks = extractedLinks;

          setScrapedJobs(prev => prev.map(j => {
            if (j.id === job.id) {
              return { ...j, ...updates };
            }
            return j;
          }));
        } catch (e) { }
      }));

      completed += batch.length;
      setProgress(50 + Math.floor((completed / total) * 50));
    }
    setLoadingDetails(false);
    setProgress(100);
  };

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const activeList = useMemo(() => {
    let result = scrapedJobs.filter(job => !appliedJobsMap[job.url] && (job.daysLeft === undefined || job.daysLeft >= 0));

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(job => job.name.toLowerCase().includes(q) || job.lastDate.includes(q));
    }

    result.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (sortConfig.key === 'daysLeft') {
        aValue = a.daysLeft === undefined ? 9999 : a.daysLeft;
        bValue = b.daysLeft === undefined ? 9999 : b.daysLeft;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [scrapedJobs, appliedJobsMap, searchQuery, sortConfig]);

  const appliedList = useMemo(() => {
    return Object.values(appliedJobsMap).sort((a, b) => {
      return new Date(b.appliedDate || 0).getTime() - new Date(a.appliedDate || 0).getTime();
    });
  }, [appliedJobsMap]);

  const exportToCSV = () => {
    const headers = ['Job Name', 'Last Date', 'Days Left', 'Apply Link', 'Notification Link', 'Status'];
    const csvRows = [headers.join(',')];

    [...activeList, ...appliedList].forEach(job => {
      const applyUrl = job.importantLinks.find(l => l.type === 'apply')?.url || '';
      const notifUrl = job.importantLinks.find(l => l.type === 'notification')?.url || '';
      const row = [
        `"${job.name.replace(/"/g, '""')}"`,
        `"${job.lastDate}"`,
        `"${job.daysLeft ?? 'Unknown'}"`,
        `"${applyUrl}"`,
        `"${notifUrl}"`,
        `"${appliedJobsMap[job.url] ? 'Applied' : 'Pending'}"`
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Sarkari_Jobs_List.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-gray-200 font-sans selection:bg-blue-500/30">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-blue-900/10 blur-[100px] rounded-full" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] bg-indigo-900/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-3 rounded-xl shadow-lg shadow-blue-900/20">
              <Briefcase className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                Sarkari Job
              </h1>
              <p className="text-sm text-gray-500">Track your government career path</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto bg-gray-900/50 p-1.5 rounded-xl border border-gray-800 backdrop-blur-sm">
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search jobs..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm pl-9 pr-4 py-2.5 rounded-lg focus:outline-none focus:bg-gray-800 transition-colors text-gray-200 placeholder-gray-600"
              />
            </div>
            <button
              onClick={exportToCSV}
              className="p-2.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Export CSV"
            >
              <Download className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-gray-700 mx-1" />
            <button
              onClick={fetchMainPage}
              disabled={loading}
              className={`p-2.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors ${loading ? 'animate-spin text-blue-500' : ''}`}
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </header>

        {(loading || loadingDetails) && !error && (
          <div className="fixed top-0 left-0 w-full h-1 bg-gray-800 z-50">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {error && (
          <div className="mb-8 p-4 rounded-xl bg-red-900/20 border border-red-900/50 flex items-center gap-3 text-red-200">
            <WifiOff className="w-5 h-5" />
            <span>{error}</span>
            <button onClick={fetchMainPage} className="ml-auto text-sm underline hover:text-white">Retry</button>
          </div>
        )}

        <section className="mb-12">
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
              Live Opportunities
              <span className="text-xs font-normal text-gray-500 ml-2 bg-gray-900 px-2 py-0.5 rounded-full border border-gray-800">{activeList.length}</span>
            </h2>
          </div>

          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl overflow-hidden backdrop-blur-sm shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/50 text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-6 py-4 font-semibold w-16 text-center">#</th>
                    <th
                      className="px-6 py-4 font-semibold cursor-pointer hover:text-blue-400 transition-colors"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-1">Job Details {sortConfig.key === 'name' && <ArrowUpDown className="w-3 h-3" />}</div>
                    </th>
                    <th className="px-6 py-4 font-semibold text-center w-32" onClick={() => handleSort('daysLeft')}>
                      <div className="flex items-center justify-center gap-1 cursor-pointer hover:text-blue-400">Deadline {sortConfig.key === 'daysLeft' && <ArrowUpDown className="w-3 h-3" />}</div>
                    </th>
                    <th className="px-6 py-4 font-semibold w-[300px]">Quick Actions</th>
                    <th className="px-6 py-4 font-semibold text-center w-24">Applied?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {activeList.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center text-gray-500">
                        {searchQuery ? 'No jobs match your search.' : 'All caught up! No active jobs found.'}
                      </td>
                    </tr>
                  ) : (
                    activeList.map((job, idx) => (
                      <tr key={job.id} className="group hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-600 text-center">{idx + 1}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noopener"
                              className="font-medium text-gray-200 group-hover:text-blue-400 transition-colors line-clamp-2 text-base"
                            >
                              {job.name}
                            </a>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span>Last Date: <span className="text-gray-400">{job.lastDate}</span></span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <StatusBadge days={job.daysLeft} status={job.status} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            {job.importantLinks.length > 0 ? (
                              job.importantLinks.map((link, i) => (
                                <ActionButton key={i} {...link} href={link.url} />
                              ))
                            ) : job.isDetailsLoaded ? (
                              <ActionButton type="other" label="Details" href={job.url} />
                            ) : (
                              <span className="text-xs text-gray-600 flex items-center gap-2 animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin" /> Loading links...
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => markAsApplied(job)}
                            className="p-2 rounded-full text-gray-600 hover:text-emerald-400 hover:bg-emerald-400/10 transition-all duration-300 transform hover:scale-110 active:scale-95"
                            title="Mark as Applied"
                          >
                            <Circle className="w-6 h-6" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mb-20">
          <button
            onClick={() => setShowApplied(!showApplied)}
            className="flex items-center justify-between w-full mb-4 px-2 group focus:outline-none"
          >
            <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-400 group-hover:text-gray-200 transition-colors">
              <History className="w-5 h-5" />
              My Applications
              <span className="text-xs font-normal text-gray-500 ml-2 bg-gray-900 px-2 py-0.5 rounded-full border border-gray-800">{appliedList.length}</span>
            </h2>
            {showApplied ? <ChevronUp className="w-5 h-5 text-gray-600" /> : <ChevronDown className="w-5 h-5 text-gray-600" />}
          </button>

          {showApplied && (
            <div className="bg-gray-900/20 border border-gray-800 rounded-2xl overflow-hidden backdrop-blur-sm">
              {appliedList.length === 0 ? (
                <div className="p-12 text-center text-gray-600">
                  <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>You haven't marked any jobs as applied yet.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <tbody className="divide-y divide-gray-800/30">
                    {appliedList.map((job) => (
                      <tr key={job.id} className="group hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500/50" />
                            <div>
                              <a href={job.url} target="_blank" className="font-medium text-gray-400 line-through decoration-gray-600 decoration-2 group-hover:text-gray-300 transition-colors">
                                {job.name}
                              </a>
                              <div className="text-xs text-gray-600 mt-0.5">Applied on: {job.appliedDate ? new Date(job.appliedDate).toLocaleDateString() : 'Unknown'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => removeApplied(job.url)}
                            className="text-gray-600 hover:text-red-400 p-2 rounded-full hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
                            title="Remove from history"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}