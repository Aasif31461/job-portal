import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const response = await fetch(`${process.env.NETLIFY_FUNCTIONS_URL}/fetchJobs`);
    const jobs = await response.json();
    res.status(200).json(jobs);
  } catch (error) {
    console.error('API handler: Failed to fetch jobs:', error);
    res.status(500).json({ message: 'Failed to fetch jobs' });
  }
}
