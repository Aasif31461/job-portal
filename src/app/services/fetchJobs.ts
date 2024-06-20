"use server";

import axios from 'axios';
import { JSDOM } from 'jsdom';

export interface Job {
  url: string;
  nameWithLink: string;
  lastDate: string;
  notificationLinks?: any;
  publishedDate?: string;
  applyLinks?: any;
  daysLeft?: number;
  applied?: boolean;
}

// Simple in-memory cache
let cache: { jobs: Job[], timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // Cache duration in milliseconds (5 minutes)

const fetchAndParseJobs = async (): Promise<Job[]> => {
  const currentTime = new Date().getTime();

  // Return cached data if within cache duration
  if (cache && currentTime - cache.timestamp < CACHE_DURATION) {
    return cache.jobs;
  }

  const url = 'https://www.sarkariresult.com/latestjob/';
  const response = await axios.get(url);
  const html = response.data;
  const jobs = parseJobsFromHtml(html);
  const currentYear = new Date().getFullYear();

  const filteredJobs = jobs.filter(job => {
    const lastDate = parseDate(job.lastDate);
    const year = getYearFromDateString(job.lastDate);
    const jobNameYear = extractYearFromJobName(job.nameWithLink);
    return (
      (lastDate >= new Date() && year.length === 4) ||
      (year === 'NA' && (typeof jobNameYear === 'number' && jobNameYear >= currentYear))
    );
  });

  // Fetch detailed job data in parallel batches
  const jobDetailsPromises = filteredJobs.map(async (job) => {
    const jobHtml = await axios.get(job.url).then(res => res.data);
    return {
      ...job,
      applyLinks: fetchApplyLink(jobHtml),
      daysLeft: calculateDaysLeft(job.lastDate),
      notificationLinks: fetchApplyNotificationLink(jobHtml),
      publishedDate: fetchPublishedDate(jobHtml)
    };
  });

  const detailedJobs = await Promise.all(jobDetailsPromises);

  detailedJobs.sort((a, b) => {
    const dateA = parseDate(a.lastDate);
    const dateB = parseDate(b.lastDate);
    if (isNaN(dateA.getTime())) return 1;
    if (isNaN(dateB.getTime())) return -1;
    return dateA.getTime() - dateB.getTime();
  });

  // Update cache
  cache = { jobs: detailedJobs, timestamp: currentTime };

  return detailedJobs;
};

const parseDate = (dateString: string): Date => {
  const parts = dateString.split('/');
  if (parts.length !== 3) return new Date(NaN);
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
};

const getYearFromDateString = (dateString: string): string => {
  const parts = dateString.split('/');
  return parts[2] || 'NA';
};

const extractYearFromJobName = (jobNameWithLink: string): number | 'NA' => {
  const yearMatch = jobNameWithLink.match(/\b(20\d{2})\b/);
  return yearMatch ? parseInt(yearMatch[1]) : 'NA';
};

const fetchApplyLink = (html: string): any => {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  let applyLinks: string[] = [];

  const trElements = document.querySelectorAll('tr');
  trElements.forEach((tr) => {
    const tdElements = tr.querySelectorAll('td');
    if (tdElements.length >= 2 && tdElements[0].textContent?.includes('Apply Online')) {
      const applyLinkElements = tdElements[1].querySelectorAll('a');
      applyLinkElements.forEach((applyLinkElement) => {
        const href = applyLinkElement.getAttribute('href') || '';
        const text = applyLinkElement.textContent?.trim() || '';
        applyLinks.push(`<a href="${href}" target="_blank">${text}</a>`);
      });
    }
  });

  return applyLinks;
};

const fetchApplyNotificationLink = (html: string): any => {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  let applyLinks: string[] = [];

  const trElements = document.querySelectorAll('tr');
  trElements.forEach((tr) => {
    const tdElements = tr.querySelectorAll('td');
    if (tdElements.length >= 2 && tdElements[0].textContent?.includes('Download') && tdElements[0].textContent?.includes('Notification')) {
      const applyLinkElements = tdElements[1].querySelectorAll('a');
      applyLinkElements.forEach((applyLinkElement) => {
        const href = applyLinkElement.getAttribute('href') || '';
        const text = applyLinkElement.textContent?.trim() || '';
        applyLinks.push(`<a href="${href}" target="_blank">${text}</a>`);
      });
    }
  });

  return applyLinks;
};

function fetchPublishedDate(html: string): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  let formattedDate = '';

  const tbody = document.querySelector('tbody');
  if (!tbody) return formattedDate;

  const trElements = tbody.querySelectorAll('tr');
  trElements.forEach((tr) => {
    const tdElements = tr.querySelectorAll('td');
    if (tdElements.length >= 2 && tdElements[0].textContent?.includes('Post Date / Update:')) {
      const dateString = tdElements[1].textContent?.trim() || '';
      formattedDate = formatDateString(dateString);
    }
  });

  return formattedDate;
}

function formatDateString(dateString: string): string {
  const [datePart, timePart] = dateString.split(' | ');
  const dateParts = datePart.split(' ');
  const day = dateParts[0];
  const month = getMonthNumber(dateParts[1]);
  const year = dateParts[2];
  const formattedDate = `${day}/${month}/${year}`;
  const finalDate = `${formattedDate} ${timePart}`;
  return finalDate;
}

function getMonthNumber(monthName: string): string {
  const months: { [key: string]: string } = {
    'January': '01', 'February': '02', 'March': '03',
    'April': '04', 'May': '05', 'June': '06',
    'July': '07', 'August': '08', 'September': '09',
    'October': '10', 'November': '11', 'December': '12'
  };
  return months[monthName] || '';
}

const calculateDaysLeft = (lastDate: string): number | undefined => {
  if (!lastDate) return undefined;

  const parts = lastDate.split('/');
  if (parts.length !== 3) return undefined;

  const endDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  const today = new Date();
  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
};

const parseJobsFromHtml = (html: string): Job[] => {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const jobContainer = document.getElementById('post');
  
  if (!jobContainer) {
    return [];
  }
  
  const jobLists = Array.from(jobContainer.querySelectorAll('ul'));
  
  if (jobLists.length === 0) {
    return [];
  }
  
  return jobLists.map((list) => {
    const jobNameLinkElement = list.querySelector('li > a');
    const jobNameWithLink = jobNameLinkElement?.outerHTML || '';
    
    // Match any string after "Last Date : " until the end of the line
    const lastDateMatch = list.textContent?.match(/Last Date : (.*)/);
    const lastDate = lastDateMatch ? lastDateMatch[1].trim() : ''; // Use the matched string
    
    const url = jobNameLinkElement?.getAttribute('href') || '';
    
    return { url, nameWithLink: jobNameWithLink, lastDate };
  });
};



export { fetchAndParseJobs };
