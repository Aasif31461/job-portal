import { NextApiRequest, NextApiResponse } from 'next';
import { fetchAndParseJobs } from '../../app/services/fetchJobs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('API handler: Fetching jobs...');
    const jobs = await fetchAndParseJobs();
    console.log('API handler: Fetched jobs:', jobs);
    res.status(200).json(jobs);
  } catch (error) {
    console.error('API handler: Failed to fetch jobs:', error);
    res.status(500).json({ message: 'Failed to fetch jobs' });
  }
}
