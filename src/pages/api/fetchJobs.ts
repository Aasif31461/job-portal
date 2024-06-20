import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('API handler: Fetching jobs...');
    const response = await fetch('http://localhost:3001/api/fetchJobs');
    const jobs = await response.json();
    // console.log('API handler: Fetched jobs:', jobs);
    res.status(200).json(jobs);
  } catch (error) {
    console.error('API handler: Failed to fetch jobs:', error);
    res.status(500).json({ message: 'Failed to fetch jobs' });
  }
}
