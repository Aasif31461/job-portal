const express = require('express');
const axios = require('axios');
const { JSDOM } = require('jsdom');

const app = express();
const port = process.env.PORT || 3001;

app.get('/api/fetchJobs', async (req, res) => {
  try {
    const url = 'https://www.sarkariresult.com/latestjob/';
    const response = await axios.get(url);
    const html = response.data;
    const jobs = parseJobsFromHtml(html);

    console.log("Job :"+jobs.length)
    const currentYear = new Date().getFullYear();

    const filteredJobs = jobs.filter(job => {
      const lastDate = parseDate(job.lastDate);
      const year = getYearFromDateString(job.lastDate);
      const jobNameYear = extractYearFromJobName(job.nameWithLink);
      console.log(jobNameYear)
      return (
        (lastDate !== 'Invalid Date' && year.length === 4 && new Date(lastDate) >= new Date()) ||
        ((jobNameYear !== 'NA') && (typeof jobNameYear === 'number' && new Date(jobNameYear)  >= new Date(currentYear)))
      );
    });

    console.log("Filtered Job lrngth: "+filteredJobs.length)

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
        const daysLeftA = a.daysLeft;
        const daysLeftB = b.daysLeft;
      
        // Handle undefined and empty values
        if (daysLeftA === undefined || daysLeftA === '') return 1;
        if (daysLeftB === undefined || daysLeftB === '') return -1;
      
        // Compare numeric values
        return daysLeftA - daysLeftB;
      });
      

    res.json(detailedJobs);
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while fetching jobs');
  }
});

const parseDate = (dateString) => {
  const parts = dateString.split('/');
  if (parts.length !== 3) return new Date(NaN);
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
};

const getYearFromDateString = (dateString) => {
  const parts = dateString.split('/');
  return parts[2] || 'NA';
};

const extractYearFromJobName = (jobNameWithLink) => {
  const yearMatch = jobNameWithLink.match(/\b(20\d{2})\b/);
  return yearMatch ? parseInt(yearMatch[1]) : 'NA';
};

const fetchApplyLink = (html) => {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  let applyLinks = [];

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

const fetchApplyNotificationLink = (html) => {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  let applyLinks = [];

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

const fetchPublishedDate = (html) => {
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
};

const formatDateString = (dateString) => {
  const [datePart, timePart] = dateString.split(' | ');
  const dateParts = datePart.split(' ');
  const day = dateParts[0];
  const month = getMonthNumber(dateParts[1]);
  const year = dateParts[2];
  const formattedDate = `${day}/${month}/${year}`;
  const finalDate = `${formattedDate} ${timePart}`;
  return finalDate;
};

const getMonthNumber = (monthName) => {
  const months = {
    'January': '01', 'February': '02', 'March': '03',
    'April': '04', 'May': '05', 'June': '06',
    'July': '07', 'August': '08', 'September': '09',
    'October': '10', 'November': '11', 'December': '12'
  };
  return months[monthName] || '';
};

const calculateDaysLeft = (lastDate) => {
  if (!lastDate) return undefined;

  const parts = lastDate.split('/');
  if (parts.length !== 3) return undefined;

  const endDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  const today = new Date();
  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays<0) return undefined;
  return diffDays;
};

const parseJobsFromHtml = (html) => {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const jobContainer = document.getElementById('post');

  if (!jobContainer) return [];

  const jobLists = Array.from(jobContainer.querySelectorAll('ul'));

  if (jobLists.length === 0) return [];

  return jobLists.map((list) => {
    const listItem = list.querySelector('li > a');
    const nameWithLink = listItem?.outerHTML || '';
    const url = listItem.href;
    // const lastDateElement = list.querySelector('li span');
    // const lastDate = lastDateElement ? lastDateElement.innerHTML.trim() : '';
    const lastDateMatch = list.textContent?.match(/Last Date : (.*)/);
    const lastDate = lastDateMatch ? lastDateMatch[1].trim() : 'NA'; // Use the matched string

    return { url, nameWithLink, lastDate };
  }).filter((job) => job !== null);
};

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
