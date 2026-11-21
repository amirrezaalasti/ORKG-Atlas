import { Request, Response, NextFunction } from 'express';
import { readOnlySparqlViolation } from '../../../shared/sparqlSafety.js';

/**
 * Validate SPARQL query syntax (basic validation)
 * Only validates if sparqlQuery is present in body
 */
export const validateSPARQLQuery = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sparqlQuery = req.body.sparqlQuery || req.body.sparqlQuery2;

  // If no SPARQL query present, skip validation
  if (!sparqlQuery) {
    return next();
  }

  if (typeof sparqlQuery !== 'string') {
    return res.status(400).json({ error: 'SPARQL query must be a string' });
  }

  // Basic validation
  if (sparqlQuery.length > 50000) {
    return res
      .status(400)
      .json({ error: 'SPARQL query too long (max 50000 characters)' });
  }

  const violation = readOnlySparqlViolation(sparqlQuery);
  if (violation || /;.*;/.test(sparqlQuery)) {
    return res.status(400).json({
      error: violation ?? 'Query contains potentially dangerous operations',
    });
  }

  next();
};

export const validateRequiredFields = (fields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing = fields.filter((field) => !req.body[field]);

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    next();
  };
};
