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
const TARGET_URL = import.meta.env.VITE_TARGET_URL || 'https://sarkariresult.com.cm/latest-jobs/';

// --- Helper Functions ---

const parseDateString = (dateStr) => {
  if (!dateStr || dateStr === 'NA') return null;
  const cleanStr = dateStr.replace(/Last Date\s*[:|-]\s*/i, '').trim();

  try {
    // Handle dd/mm/yyyy
    let match = cleanStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    }

    // Handle dd Month yyyy (e.g., 30 November 2025 or 11 June2026)
    match = cleanStr.match(/(\d{1,2})\s+([a-zA-Z]+)\s*(\d{4})/);
    const monthMap = {
      'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
      'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'jun': 5, 'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };

    if (match) {
      const monthStr = match[2].toLowerCase();
      const monthIndex = monthMap[monthStr];
      if (monthIndex !== undefined) {
        return new Date(parseInt(match[3]), monthIndex, parseInt(match[1]));
      }
    }

    // Handle Month yyyy (e.g., March 2026) -> assume last day of that month
    match = cleanStr.match(/^([a-zA-Z]+)\s+(\d{4})$/);
    if (match) {
      const monthStr = match[1].toLowerCase();
      const monthIndex = monthMap[monthStr];
      if (monthIndex !== undefined) {
        return new Date(parseInt(match[2]), monthIndex + 1, 0); // Last day of month
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
  const [selectedJob, setSelectedJob] = useState(null);
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
      
      const jobLinks = Array.from(doc.querySelectorAll('.latest-posts-last-date a'));
      const linksToParse = jobLinks.length > 0 ? jobLinks : allLinks;

      linksToParse.forEach((link, index) => {
        const text = link.textContent?.trim() || '';
        const href = link.getAttribute('href');

        if (!href || text.length < 5 || seenUrls.has(href)) return;

        if (jobLinks.length === 0) {
            const lowerText = text.toLowerCase();
            const isLikelyJob = lowerText.includes('recruitment') || lowerText.includes('online form') || lowerText.includes('vacancy') || lowerText.includes('apply');
            if (!isLikelyJob) return;
        }

        let dateStr = 'NA';
        let dateObj = null;

        const parentText = link.parentElement?.textContent || '';
        const dateMatch = parentText.match(/Last Date\s*[:|-]\s*(.+)/i) ||
          text.match(/Last Date\s*[:|-]\s*(.+)/i);

        if (dateMatch) {
          dateStr = dateMatch[1].trim();
          dateObj = parseDateString(dateStr);
        }

        const daysLeft = calculateDaysLeft(dateObj);
        if (daysLeft !== undefined && daysLeft < 0) return;

        let fullUrl = href;
        if (href.startsWith('/')) {
          try { fullUrl = new URL(href, TARGET_URL).href; } catch (e) { }
        }

        seenUrls.add(fullUrl);
        
        let jobName = text.replace(/[-–]?\s*Last Date.*$/i, '').trim();

        parsedJobs.push({
          id: `job-${index}`,
          name: jobName,
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

          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
              const rawLabel = cells[0].textContent?.trim() || 'Link';
              const labelLower = rawLabel.toLowerCase();

              // Prevent grabbing "Latest Posts" or extremely long labels
              if (rawLabel.length > 80 || labelLower.includes('latest posts') || labelLower.includes('related posts')) return;

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

          // Extract info blocks (Important Dates, Fees, Age, etc.)
          const infoBlocks = [];
          
          const tables = Array.from(doc.querySelectorAll('table'));
          tables.forEach(table => {
            const tableText = table.textContent?.toLowerCase() || '';
            if (tableText.includes('latest posts') || tableText.includes('apply online') || tableText.includes('useful important links') || tableText.includes('whatsapp') || tableText.includes('telegram') || tableText.includes('important question')) return;
            
            const trs = Array.from(table.querySelectorAll('tr'));
            if (trs.length < 2) return;
            
            let header = trs[0].textContent?.trim() || '';
            let tRows = [];
            for (let i = 1; i < trs.length; i++) {
              const tds = Array.from(trs[i].querySelectorAll('td')).map(td => td.textContent?.trim() || '');
              if (tds.length > 0 && tds.some(t => t.length > 0)) tRows.push(tds);
            }
            
            if (tRows.length > 0) {
              infoBlocks.push({ type: 'table', title: header, rows: tRows });
            }
          });

          const headers = Array.from(doc.querySelectorAll('h4, h5, h6'));
          headers.forEach(h => {
            const text = h.textContent?.trim() || '';
            if (text.includes('Important Dates') || text.includes('Application Fee') || text.includes('Age Limit') || text.includes('Total Post')) {
              let next = h.nextElementSibling;
              if (!next && h.parentElement) next = h.parentElement.nextElementSibling;
              
              if (next) {
                const lis = Array.from(next.querySelectorAll('li'));
                if (lis.length > 0) {
                  infoBlocks.push({ type: 'list', title: text, items: lis.map(li => li.textContent?.trim() || '') });
                } else {
                  const divText = next.textContent?.trim() || '';
                  if (divText) {
                    infoBlocks.push({ type: 'text', title: text, text: divText });
                  }
                }
              }
            }
          });

          // Sort infoBlocks so Important Dates, Application Fee, Age Limit, and Total Post appear first
          infoBlocks.sort((a, b) => {
            const getRank = (title) => {
              const t = title.toLowerCase();
              if (t.includes('important date')) return 1;
              if (t.includes('application fee')) return 2;
              if (t.includes('age limit')) return 3;
              if (t.includes('total post') || t.includes('vacancy details')) return 4;
              return 5;
            };
            return getRank(a.title) - getRank(b.title);
          });

          updates.infoBlocks = infoBlocks;

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
    let result = scrapedJobs.filter(job => !appliedJobsMap[job.url] && job.daysLeft !== undefined && job.daysLeft >= 0);

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
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedJob(job); }}
                              className="font-medium text-gray-200 hover:text-blue-400 transition-colors text-left line-clamp-2 text-base focus:outline-none"
                            >
                              {job.name}
                            </button>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span>Last Date: <span className="text-gray-400">{job.lastDate}</span></span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <StatusBadge days={job.daysLeft} status={job.status} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2 items-center">
                            {job.importantLinks.length > 0 ? (
                              job.importantLinks.map((link, i) => (
                                <ActionButton key={i} {...link} href={link.url} />
                              ))
                            ) : job.isDetailsLoaded ? null : (
                              <span className="text-xs text-gray-600 flex items-center gap-2 animate-pulse mr-2">
                                <Loader2 className="w-3 h-3 animate-spin" /> Loading links...
                              </span>
                            )}
                            {job.isDetailsLoaded && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedJob(job); }}
                                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 border border-blue-500/20 transition-all flex items-center gap-1 ml-1"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  View Details
                                </button>
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

      {/* Modal Popup */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedJob(null)}>
          <div 
            className="bg-[#0f1117] border border-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative p-6 shadow-2xl custom-scrollbar"
            onClick={e => e.stopPropagation()}
          >
            <button 
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-800"
              onClick={() => setSelectedJob(null)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            
            <h2 className="text-2xl font-bold text-white mb-3 pr-10">{selectedJob.name}</h2>
            
            <div className="flex flex-wrap items-center gap-3 mb-8 pb-4 border-b border-gray-800">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${selectedJob.daysLeft !== undefined && selectedJob.daysLeft <= 3 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                {selectedJob.daysLeft !== undefined ? (selectedJob.daysLeft === 0 ? 'Last Day Today' : `${selectedJob.daysLeft} days left`) : 'Available Soon'}
              </span>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-800 text-gray-300 border border-gray-700">
                Deadline: {selectedJob.lastDate}
              </span>
              {appliedJobsMap[selectedJob.url] && (
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Applied
                </span>
              )}
            </div>

            {!selectedJob.isDetailsLoaded ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                <p className="text-lg">Loading job details...</p>
              </div>
            ) : (
              <div className="space-y-8">
                {selectedJob.importantLinks && selectedJob.importantLinks.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <LinkIcon className="w-5 h-5 text-blue-400" />
                      Important Links
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedJob.importantLinks.map((link, i) => (
                        <a 
                          key={i} 
                          href={link.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 rounded-xl bg-gray-900/50 border border-gray-800 hover:bg-gray-800 hover:border-gray-700 transition-all group"
                        >
                          <span className="font-medium text-gray-200 group-hover:text-blue-400 transition-colors line-clamp-1">{link.label}</span>
                          <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-blue-400 flex-shrink-0 ml-2" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {selectedJob.infoBlocks && selectedJob.infoBlocks.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {selectedJob.infoBlocks.map((block, i) => {
                      const isHighlight = block.title.toLowerCase().includes('important date') || block.title.toLowerCase().includes('application fee');
                      return (
                        <div key={i} className={`rounded-xl p-5 border ${isHighlight ? 'bg-blue-900/10 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'bg-gray-900/40 border-gray-800'} ${block.type === 'table' ? 'lg:col-span-2' : ''}`}>
                          <h4 className={`font-semibold mb-4 pb-2 border-b ${isHighlight ? 'text-blue-300 border-blue-500/30' : 'text-blue-400 border-gray-800/50'}`}>
                            {block.title}
                          </h4>
                          {block.type === 'list' && (
                            <ul className={`list-disc pl-5 space-y-2 text-sm marker:text-gray-600 ${isHighlight ? 'text-blue-100/90' : 'text-gray-300'}`}>
                              {block.items.map((item, j) => <li key={j}>{item}</li>)}
                            </ul>
                          )}
                          {block.type === 'text' && (
                            <p className={`text-sm whitespace-pre-wrap leading-relaxed ${isHighlight ? 'text-blue-100/90 font-medium' : 'text-gray-300'}`}>{block.text}</p>
                          )}
                          {block.type === 'table' && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm text-left">
                                <tbody>
                                  {block.rows.map((r, j) => (
                                    <tr key={j} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/20">
                                      {r.map((c, k) => (
                                        <td key={k} className={`py-3 pr-4 text-gray-300 align-top ${k === 0 ? 'font-medium text-gray-400 w-1/4' : ''}`}>{c}</td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-gray-900/40 rounded-xl p-8 border border-gray-800 text-center">
                    <FileText className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No additional details extracted</p>
                    <p className="text-sm text-gray-600 mt-1">You can view the full details on the original website.</p>
                  </div>
                )}
                
                <div className="pt-6 mt-8 border-t border-gray-800 flex justify-between items-center sticky bottom-0 bg-[#0f1117] p-4 -m-6 rounded-b-2xl border-t border-gray-800/80 backdrop-blur-md bg-[#0f1117]/90 z-10">
                  <button
                    onClick={() => {
                      markAsApplied(selectedJob);
                      setSelectedJob(null);
                    }}
                    className={`px-5 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2 ${appliedJobsMap[selectedJob.url] ? 'bg-gray-800 text-gray-400 cursor-not-allowed' : 'bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 border border-emerald-500/20'}`}
                    disabled={appliedJobsMap[selectedJob.url]}
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    {appliedJobsMap[selectedJob.url] ? 'Applied' : 'Mark as Applied'}
                  </button>

                  <a 
                    href={selectedJob.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2"
                  >
                    <Globe className="w-4 h-4" />
                    Original Page
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}