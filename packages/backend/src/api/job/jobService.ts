import { and, eq, like, SQL, sql } from 'drizzle-orm';
import { Request, Response } from 'express';
import { company, job, jobCategory, jobLevel, jobSaved } from 'src/db/schema';
import { logger } from 'src/server';
import { z, ZodError } from 'zod';

import { db } from '../../db';
import { createJobSchema, JobCategorySchema, JobSchema } from './jobModel';

export const getJobById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: 'Job ID is required' });
    }

    const foundJob = await db.query.job.findFirst({
      where: eq(job.id, id),
    });

    if (!foundJob) {
      return res.status(404).json({ message: 'Job not found' });
    }

    return res.status(200).json(foundJob);
  } catch (error) {
    logger.error('Error fetching job', error);
    return res.status(500).json({
      message: 'Internal Server Error',
      error: (error as Error).message,
    });
  }
};

export const deleteJobById = async (req: Request, res: Response) => {
  if (!req.user || req.user.role.toLowerCase() != 'admin') {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: 'Job ID is required' });
    }

    const result = await db.delete(job).where(eq(job.id, id));
    if (result === undefined || result.length === 0) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.status(204).json(result);
  } catch (error) {
    logger.error('Error deleting job', error);
    return res.status(500).json({
      message: 'Internal Server Error',
      error: (error as Error).message,
    });
  }
};

export const updateJob = async (req: Request, res: Response) => {
  if (!req.user || req.user.role.toLowerCase() != 'admin') {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    const { jobId } = req.params;

    if (!z.string().uuid().safeParse(jobId).success) {
      return res.status(400).json({ error: 'Invalid job ID format' });
    }

    const jobData = JobSchema.parse(req.body);

    const updatedJob = await db
      .update(job)
      .set({
        ...jobData,
        updatedAt: new Date(),
      })
      .where(eq(job.id, jobId))
      .returning();

    if (updatedJob.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.status(200).json(updatedJob[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(422).json({ error: 'Validation exception', msg: error.errors });
    } else {
      logger.error('Error updating job:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

export const getJobs = async (req: Request, res: Response) => {
  try {
    const { pageIndex = '1', pageSize = '10', categoryId, levelId, companyName } = req.query;

    const page = parseInt(pageIndex as string, 10) || 1;
    const limit = parseInt(pageSize as string, 10) || 10;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [eq(job.isApproved, true)];

    if (categoryId) {
      conditions.push(eq(job.categoryId, parseInt(categoryId as string, 10)));
    }

    if (levelId) {
      conditions.push(eq(job.levelId, parseInt(levelId as string, 10)));
    }

    if (companyName) {
      conditions.push(like(company.name, `%${companyName as string}%`));
    }

    let baseQuery = db
      .select({
        job: job,
        category: jobCategory.title,
        level: jobLevel.title,
        companyName: company.name,
      })
      .from(job)
      .leftJoin(jobCategory, eq(job.categoryId, jobCategory.id))
      .leftJoin(jobLevel, eq(job.levelId, jobLevel.id))
      .leftJoin(company, eq(job.companyId, company.id));

    if (conditions.length > 0) {
      baseQuery = baseQuery.where(and(...conditions)) as typeof baseQuery;
    }

    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(job)
      .leftJoin(jobCategory, eq(job.categoryId, jobCategory.id))
      .leftJoin(jobLevel, eq(job.levelId, jobLevel.id))
      .leftJoin(company, eq(job.companyId, company.id));

    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }

    const finalQuery = baseQuery.limit(limit).offset(offset);

    const [totalCount, result] = await Promise.all([countQuery.execute(), finalQuery.execute()]);

    if (!totalCount || !result) {
      throw new Error('Failed to fetch jobs');
    }

    if (result.length === 0) return res.status(404).json('No job found');

    res.json({
      data: result,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalCount: totalCount[0].count,
        totalPages: Math.ceil(totalCount[0].count / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const submitJobForApproval = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let isAdmin;
    req.user.role.toLowerCase() === 'admin' ? (isAdmin = true) : (isAdmin = false);
    const jobData = createJobSchema.safeParse(req.body);

    if (!jobData.success) {
      return res.status(422).json({
        message: 'Validation error',
        errors: jobData.error.errors,
      });
    }
    const newJob = await db
      .insert(job)
      .values({
        title: jobData.data.title,
        levelId: jobData.data.level_id,
        categoryId: jobData.data.category_id,
        typeId: jobData.data.type_id,
        location: jobData.data.location,
        description: jobData.data.description,
        compensation: jobData.data.compensation,
        applicationLink: jobData.data.application_link,
        isExternal: jobData.data.is_external,
        companyId: jobData.data.company_id,
        tags: jobData.data.tags,
        isApproved: isAdmin,
      })
      .returning();

    res.status(202).json({
      message: 'Job submitted for approval',
      jobId: newJob[0].id,
    });
  } catch (error) {
    logger.error('Error submitting job for approval:', error);
    res.status(400).json({ message: 'Invalid input' });
  }
};

export const approveJob = async (req: Request, res: Response) => {
  if (!req.user || req.user.role.toLocaleLowerCase() != 'admin') {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const { jobId } = req.params;

  try {
    if (!jobId) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }

    const result = await db.update(job).set({ isApproved: true }).where(eq(job.id, jobId)).returning({ id: job.id });

    if (result.length === 0) {
      return res.status(404).json({ message: 'Job not found' });
    }

    res.status(200).json({
      message: 'Job approved successfully',
      jobId: result[0].id,
    });
  } catch (error) {
    logger.error('Error approving job:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const rejectJob = async (req: Request, res: Response) => {
  if (!req.user || req.user.role.toLocaleLowerCase() != 'admin') {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }
    const rejectedJob = await db.delete(job).where(eq(job.id, jobId)).returning();
    if (rejectedJob.length === 0) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.status(200).json({ message: 'Job rejected successfully', jobId: rejectedJob[0] });
  } catch (error) {
    logger.error('Error rejecting job:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createJobCategory = async (req: Request, res: Response) => {
  const { title } = JobCategorySchema.parse(req.body);
  try {
    const newCategory = await db
      .insert(jobCategory)
      .values({ title })
      .returning()
      .catch((error) => {
        throw new error('Job category already exist');
      });

    res.status(201).json({
      message: 'Job category created successfully',
      category: newCategory[0],
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Invalid input', errors: error.errors });
    }
    if ((error as Error).message === 'Job category already exists') {
      return res.status(409).json({ message: (error as Error).message });
    }
    logger.error('Error creating job category:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const categoryID = parseInt(id, 10);
    const categoryFound = await db.select().from(jobCategory).where(eq(jobCategory.id, categoryID));
    if (categoryFound.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.status(200).json({ category: categoryFound[0] });
  } catch (error) {
    logger.error('Error fetching job category', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const upadteJobCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const categoryID = parseInt(id, 10);
    const { title } = JobCategorySchema.parse(req.body);
    const updatedCategory = await db
      .update(jobCategory)
      .set({ title })
      .where(eq(jobCategory.id, categoryID))
      .returning();
    if (updatedCategory.length === 0) {
      return res.status(404).json({ message: 'Job category not found' });
    }
    res.status(200).json({
      message: 'Job category updated successfully',
      category: updatedCategory[0],
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Invalid input', errors: error.errors });
    }
    if (error instanceof Error && error.message.includes('unique constraint')) {
      return res.status(409).json({ message: 'A job category with this title already exists' });
    }
    logger.error('Error updating job category:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteJobCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const categoryID = parseInt(id, 10);
    const deletedCategory = await db.delete(jobCategory).where(eq(jobCategory.id, categoryID)).returning();
    if (deletedCategory.length === 0) {
      return res.status(404).json({ error: 'Job category not found' });
    }
    return res.status(200).json({
      message: 'Job category deleted successfully',
      category: deletedCategory[0],
    });
  } catch (error) {
    logger.error('Error deleting job category:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createJobLevel = async (req: Request, res: Response) => {
  try {
    const { title } = JobCategorySchema.parse(req.body);
    const newLevel = await db
      .insert(jobLevel)
      .values({ title })
      .returning()
      .catch((error) => {
        throw error('Job category already exist');
      });

    res.status(201).json({
      message: 'Job category created successfully',
      category: newLevel[0],
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Invalid input', errors: error.errors });
    }
    if ((error as Error).message === 'Job category already exists') {
      return res.status(409).json({ message: (error as Error).message });
    }
    logger.error('Error creating job category:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getJobLevelById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const levelID = parseInt(id, 10);
    const levelFound = await db.select().from(jobLevel).where(eq(jobLevel.id, levelID));
    if (levelFound.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }
    res.status(200).json({ category: levelFound[0] });
  } catch (error) {
    logger.error('Error fetching job category', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateJobLevel = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const levelID = parseInt(id, 10);
    const { title } = JobCategorySchema.parse(req.body);
    const updatedLevel = await db.update(jobLevel).set({ title }).where(eq(jobLevel.id, levelID)).returning();
    if (updatedLevel.length === 0) {
      return res.status(404).json({ message: 'Job level not found' });
    }
    res.status(200).json({
      message: 'Job level updated successfully',
      level: updatedLevel[0],
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Invalid input', errors: error.errors });
    }
    if (error instanceof Error && error.message.includes('unique constraint')) {
      return res.status(409).json({ message: 'A job level with this title already exists' });
    }
    logger.error('Error updating job level:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteJobLevel = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const levelID = parseInt(id, 10);
    const deletedLevel = await db.delete(jobLevel).where(eq(jobLevel.id, levelID)).returning();
    if (deletedLevel.length === 0) {
      return res.status(404).json({ error: 'Job level not found' });
    }
    return res.status(200).json({
      message: 'Job level deleted successfully',
      level: deletedLevel[0],
    });
  } catch (error) {
    logger.error('Error deleting job level:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!id || !userId) {
      return res.status(400).json({ error: 'bad request' });
    }

    const savedJobResult = await db
      .insert(jobSaved)
      .values({
        userId: userId,
        jobId: id,
      })
      .returning();

    if (savedJobResult.length === 0) {
      return res.status(500).json({ error: 'Failed to save job' });
    }

    const savedJob = savedJobResult[0];
    return res.status(200).json({ savedJob, message: 'Job saved successfully' });
  } catch (error) {
    logger.error('Error saving job:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
export const getCategories = async (req: Request, res: Response): Promise<Response> => {
  try {
    const categories = await db.select().from(jobCategory);
    if (!categories) return res.status(400).json('Something went wrong');
    return res.status(200).json(categories);
  } catch (error) {
    return res.status(500).json('Internal server error');
  }
};
