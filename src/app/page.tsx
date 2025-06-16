"use client";

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

interface Job {
  url: string;
  nameWithLink: string;
  lastDate: string;
  notificationLinks?: string[];
  publishedDate?: string;
  applyLinks?: string[];
  daysLeft?: number;
  applied?: boolean;
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Job; direction: 'asc' | 'desc' } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch("http://localhost:3002/api/fetchJobs");
        if (!response.ok) throw new Error('Failed to fetch jobs');
        const jobsData: Job[] = await response.json();
        const appliedJobs = JSON.parse(localStorage.getItem('appliedJobs') || '{}');
        const updatedJobs = jobsData.map(job => ({ ...job, applied: appliedJobs[job.url] || false }));
        setJobs(updatedJobs);
      } catch (error) {
        console.error('Failed to fetch jobs:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
  }, []);

  useEffect(() => {
    if (!loading) {
      const appliedJobs = jobs.reduce((acc: any, job) => {
        if (job.applied) {
          acc[job.url] = true;
        }
        return acc;
      }, {});
      localStorage.setItem('appliedJobs', JSON.stringify(appliedJobs));
    }
  }, [jobs, loading]);

  const handleSort = (key: keyof Job) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const toggleApplied = (url: string) => {
    const updatedJobs = jobs.map(job => (job.url === url ? { ...job, applied: !job.applied } : job));
    setJobs(updatedJobs);
  };

  const toggleAllApplied = () => {
    const allApplied = jobs.every(job => job.applied);
    const updatedJobs = jobs.map(job => ({ ...job, applied: !allApplied }));
    setJobs(updatedJobs);
  };

  const exportToExcel = () => {
    const extractLinkInfo = (htmlString: string) => {
      const textMatch = htmlString?.match(/>(.*?)</);
      const linkMatch = htmlString?.match(/href="(.*?)"/);
      return textMatch && linkMatch ? { v: textMatch[1], l: { Target: linkMatch[1], Tooltip: textMatch[1] } } : null;
    };
  
    const flattenedExportData: any[] = [];
    
    jobs.forEach((job, index) => {
      const notifications = job.notificationLinks ? job.notificationLinks.map(extractLinkInfo).filter(Boolean) : [];
      const applyLinks = job.applyLinks ? job.applyLinks.map(extractLinkInfo).filter(Boolean) : [];
      
      const maxLinks = Math.max(notifications.length, applyLinks.length);
      
      for (let i = 0; i < maxLinks; i++) {
        if (i === 0) {
          flattenedExportData.push({
            '#': index + 1,
            'Job Name': { v: job.nameWithLink.replace(/<[^>]+>/g, ''), l: { Target: job.url, Tooltip: job.nameWithLink.replace(/<[^>]+>/g, '') } },
            'Post Date': job.publishedDate !== 'NA' ? job.publishedDate : '',
            'Last Date to Apply': job.lastDate !== 'NA' ? job.lastDate : '',
            'Days Left': job.daysLeft !== undefined && !Number.isNaN(job.daysLeft) ? job.daysLeft : '',
            'Notifications': notifications[i] ? notifications[i]?.v : '',
            'Apply': applyLinks[i] ? applyLinks[i]?.v : '',
            'Applied': job.applied ? 'Yes' : 'No',
          });
        } else {
          flattenedExportData.push({
            '#': '',
            'Job Name': '',
            'Post Date': '',
            'Last Date to Apply': '',
            'Days Left': '',
            'Notifications': notifications[i] ? notifications[i]?.v : '',
            'Apply': applyLinks[i] ? applyLinks[i]?.v : '',
            'Applied': '',
          });
        }
      }
    });
  
    const worksheet = XLSX.utils.json_to_sheet(flattenedExportData, {
      cellStyles: true,
      header: ['#', 'Job Name', 'Post Date', 'Last Date to Apply', 'Days Left', 'Notifications', 'Apply', 'Applied'],
    });
  
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Jobs');
  
    // Add hyperlinks manually
    let currentRow = 2; // Start after the header row
    jobs.forEach((job) => {
      const notifications = job.notificationLinks ? job.notificationLinks.map(extractLinkInfo).filter(Boolean) : [];
      const applyLinks = job.applyLinks ? job.applyLinks.map(extractLinkInfo).filter(Boolean) : [];
  
      const maxLinks = Math.max(notifications.length, applyLinks.length);
      
      for (let i = 0; i < maxLinks; i++) {
        if (notifications[i]) {
          worksheet[`F${currentRow}`] = { v: notifications[i]?.v, l: notifications[i]?.l };
        }
        if (applyLinks[i]) {
          worksheet[`G${currentRow}`] = { v: applyLinks[i]?.v, l: applyLinks[i]?.l };
        }
        currentRow++;
      }
    });
  
    XLSX.writeFile(workbook, 'jobs.xlsx');
  };  

  const sortedJobs = [...jobs];
  if (sortConfig !== null) {
    sortedJobs.sort((a: any, b: any) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const filteredJobs = sortedJobs.filter(job => {
    const queryTokens = searchQuery.toLowerCase().split(' ').filter(token => token.trim() !== '');
    return queryTokens.every(token =>
      job.nameWithLink.toLowerCase().includes(token) ||
      job.publishedDate?.toLowerCase().includes(token) ||
      job.lastDate.toLowerCase().includes(token) ||
      (job.daysLeft !== undefined && !Number.isNaN(job.daysLeft) && job.daysLeft?.toString().includes(token))
    );
  });

  return (
    <main className="container min-h-96 mx-auto p-4 border border-gray-300 dark:border-gray-700 rounded-lg shadow-md dark:bg-gray-900">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100 text-center">Latest Job Listings</h1>
      <div className="mb-4 flex justify-between items-center">
        <input
          type="text"
          placeholder="Search..."
          className="w-full p-2.5 border border-gray-300 rounded-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <button
          onClick={exportToExcel}
          className="ml-4 px-8 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-700"
        >
          Export
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full bg-white dark:bg-gray-800 border-collapse">
          <thead>
            <tr>
              <th className="px-4 py-2 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">#</th>
              <th
                className="px-4 py-2 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer"
                onClick={() => handleSort('nameWithLink')}
              >
                Job Name
                {sortConfig?.key === 'nameWithLink' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
              </th>
              <th
                className="px-4 py-2 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer"
                onClick={() => handleSort('publishedDate')}
              >
                Post Date
                {sortConfig?.key === 'publishedDate' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
              </th>
              <th
                className="px-4 py-2 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer"
                onClick={() => handleSort('lastDate')}
              >
                Last Date to Apply
                {sortConfig?.key === 'lastDate' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
              </th>
              <th
                className="px-4 py-2 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-left text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer"
                onClick={() => handleSort('daysLeft')}
              >
                Days Left
                {sortConfig?.key === 'daysLeft' && (sortConfig.direction === 'asc' ? ' ▲' : ' ▼')}
              </th>
              <th className="px-4 py-2 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Links</th>
              <th className="px-4 py-2 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Apply Online</th>
              <th className="px-4 py-2 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">
                Applied
                <span className="ml-2 flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    checked={jobs.every(job => job.applied)}
                    onChange={toggleAllApplied}
                  />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.map((job, index) => (
              <tr key={index} className={`${job.applied ? 'dark:text-gray-700' : ''}`}>
                <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">{index + 1}</td>
                <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900" dangerouslySetInnerHTML={{ __html: job.nameWithLink }}></td>
                <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">{job.publishedDate !== 'NA' ? job.publishedDate : ''}</td>
                <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">{job.lastDate !== 'NA' ? job.lastDate : ''}</td>
                <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">{job.daysLeft !== undefined && !Number.isNaN(job.daysLeft) ? job.daysLeft : ''}</td>
                <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
                  {job.notificationLinks ? job.notificationLinks.map((notificationLink, idx) => (
                    <div key={idx} dangerouslySetInnerHTML={{ __html: notificationLink }} />
                  )) : ''}
                </td>
                <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
                  {job.applyLinks ? job.applyLinks.map((applyLink, idx) => (
                    <div key={idx} dangerouslySetInnerHTML={{ __html: applyLink }} />
                  )) : ''}
                </td>
                <td className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
                  <input
                    type="checkbox"
                    checked={job.applied}
                    className="cursor-pointer"
                    onChange={() => toggleApplied(job.url)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && (
        <div className="mt-20 flex justify-center">
          <div className="text-gray-900 dark:text-gray-100 text-lg font-semibold">Loading, Please wait...</div>
        </div>
      )}
    </main>
  );
}