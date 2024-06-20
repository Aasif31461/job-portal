const axios = require('axios');
const { JSDOM } = require('jsdom');

exports.handler = async function(event, context) {
  try {
    const url = 'https://www.sarkariresult.com/latestjob/';
    const response = await axios.get(url);
    const html = response.data;
    const jobs = parseJobsFromHtml(html);
    const currentYear = new Date().getFullYear();

    const filteredJobs = jobs.filter(job => isValidJob(job, currentYear));

    const detailedJobs = await Promise.all(filteredJobs.map(async (job) => {
      const jobHtml = await axios.get(job.url).then(res => res.data);
      return {
        ...job,
        applyLinks: extractLinks(jobHtml, 'Apply Online'),
        lastDate: extractLastDate(jobHtml, job.lastDate),
        daysLeft: calculateDaysLeft(job.lastDate),
        notificationLinks: extractLinks(jobHtml, 'Download Notification'),
        publishedDate: extractPublishedDate(jobHtml)
      };
    }));

    const detailedJobsModified = detailedJobs.filter(job => {
      const lastDate = parseDate(job.lastDate);
      return ((lastDate == 'Invalid Date' && isDateWithinMonths(job.publishedDate, 3)) || (lastDate !== 'Invalid Date' && lastDate >= new Date()));
    });

    detailedJobsModified.sort(compareByDaysLeft);

    return {
      statusCode: 200,
      body: JSON.stringify(detailedJobsModified),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: 'An error occurred while fetching jobs',
    };
  }
};

// Add the utility functions (parseJobsFromHtml, isValidJob, extractLinks, extractLastDate, calculateDaysLeft, extractPublishedDate, etc.) here

function isDateWithinMonths(dateTimeStr, months) {
    const dateStr = dateTimeStr.split(' ')[0];
    const [day, month, year] = dateStr.split('/').map(Number);
    const inputDate = new Date(year, month - 1, day);
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - months);
    return inputDate > pastDate;
  }
  
  function parseDate(dateString) {
    const parts = dateString.split('/');
    if (parts.length !== 3) return new Date(NaN);
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  
  function getYearFromDateString(dateString) {
    const parts = dateString.split('/');
    return parts[2] || 'NA';
  }
  
  function extractYearFromJobName(jobNameWithLink) {
    const yearMatch = jobNameWithLink.match(/\b(20\d{2})\b/);
    return yearMatch ? parseInt(yearMatch[1]) : 'NA';
  }
  
  function extractLinks(html, linkText) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const links = [];
  
    document.querySelectorAll('tr').forEach(tr => {
      const tdElements = tr.querySelectorAll('td');
      if (tdElements.length >= 2 && tdElements[0].textContent?.includes(linkText)) {
        tdElements[1].querySelectorAll('a').forEach(a => {
          links.push(`<a href="${a.href}" target="_blank">${a.textContent.trim()}</a>`);
        });
      }
    });
  
    return links;
  }
  
  function extractLastDate(html, lastDate) {
    if (lastDate && lastDate.includes('/')) return lastDate;
  
    const dom = new JSDOM(html);
    const document = dom.window.document;
    let dateText = '';
  
    document.querySelectorAll('tr td ul li').forEach(li => {
      if (li.textContent.includes('Last Date for Apply Online :') || li.textContent.includes('Last Date for Registration :')) {
        const spanElement = li.querySelector('span');
        dateText = spanElement ? spanElement.textContent.trim() : 'NA';
      }
    });
  
    return dateText.includes('/') ? dateText : lastDate;
  }
  
  function extractPublishedDate(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    let formattedDate = '';
  
    document.querySelectorAll('tr').forEach(tr => {
      const tdElements = tr.querySelectorAll('td');
      if (tdElements.length >= 2 && tdElements[0].textContent?.includes('Post Date / Update:')) {
        formattedDate = formatDateString(tdElements[1].textContent.trim());
      }
    });
  
    return formattedDate;
  }
  
  function formatDateString(dateString) {
    const [datePart] = dateString.split(' | ');
    const [day, monthName, year] = datePart.split(' ');
    const month = getMonthNumber(monthName);
    return `${day}/${month}/${year}`;
  }
  
  function getMonthNumber(monthName) {
    const months = {
      'January': '01', 'February': '02', 'March': '03',
      'April': '04', 'May': '05', 'June': '06',
      'July': '07', 'August': '08', 'September': '09',
      'October': '10', 'November': '11', 'December': '12'
    };
    return months[monthName] || '';
  }
  
  function calculateDaysLeft(lastDate) {
    if (!lastDate) return undefined;
    const [day, month, year] = lastDate.split('/').map(Number);
    const endDate = new Date(year, month - 1, day);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays < 0 ? undefined : diffDays;
  }
  
  function parseJobsFromHtml(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const jobContainer = document.getElementById('post');
  
    if (!jobContainer) return [];
  
    return Array.from(jobContainer.querySelectorAll('ul')).map(list => {
      const listItem = list.querySelector('li > a');
      const nameWithLink = listItem?.outerHTML || '';
      const url = listItem.href;
      const lastDateMatch = list.textContent?.match(/Last Date : (.*)/);
      const lastDate = lastDateMatch ? lastDateMatch[1].trim() : 'NA';
      return { url, nameWithLink, lastDate };
    }).filter(job => job !== null);
  }
  
  function isValidJob(job, currentYear) {
    const lastDate = parseDate(job.lastDate);
    const year = getYearFromDateString(job.lastDate);
    const jobNameYear = extractYearFromJobName(job.nameWithLink);
    return (
      (lastDate !== 'Invalid Date' && year.length === 4 && lastDate >= new Date()) ||
      (jobNameYear !== 'NA' && typeof jobNameYear === 'number' && !job.lastDate?.includes('/') && jobNameYear >= currentYear)
    );
  }
  
  function compareByDaysLeft(a, b) {
    const daysLeftA = a.daysLeft;
    const daysLeftB = b.daysLeft;
    if (!daysLeftA) return 1;
    if (!daysLeftB) return -1;
    return daysLeftA - daysLeftB;
  }