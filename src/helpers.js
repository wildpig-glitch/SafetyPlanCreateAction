//import { api, route } from '@forge/api';
import { asApp, route } from '@forge/api';
import { sourceProjectKey,issueTypeCache,projectCache } from './constants.js';

// Helper: Get valid issue types for a project (with caching)
async function getProjectIssueTypes(projectKey) {
  if (projectCache.has(projectKey)) {
    return projectCache.get(projectKey);
  }
  
  const res = await asApp().requestJira(
    route`/rest/api/3/project/${projectKey}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch project info: ${res.status} ${await res.text()}`);
  }
  const project = await res.json();
  projectCache.set(projectKey, project.issueTypes);
  return project.issueTypes; // Array of {id, name, ...}
}

// Helper: Find issue type ID by name in a project
export async function getIssueTypeIdByName(projectKey, issueTypeName) {
  const cacheKey = `${projectKey}-${issueTypeName}`;
  if (issueTypeCache.has(cacheKey)) {
    return issueTypeCache.get(cacheKey);
  }
  const issueTypes = await getProjectIssueTypes(projectKey);
  const found = issueTypes.find(type => type.name === issueTypeName);
  if (!found) {
    throw new Error(`Issue type "${issueTypeName}" not found in project "${projectKey}"`);
  }
  issueTypeCache.set(cacheKey, found.id);
  return found.id;
}

// Batch fetch multiple issues with expand to get all details at once
async function fetchIssuesWithDetails(issueKeys) {
  if (issueKeys.length === 0) return [];
  
  // Jira REST API supports fetching multiple issues in one call
  const jql = `key in (${issueKeys.map(key => `"${key}"`).join(',')})`;
  
  const res = await asApp().requestJira(
    route`/rest/api/3/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql,
        fields: ['key', 'summary', 'description', 'issuetype'],
        expand: ['names'],
        maxResults: 1000 // Adjust based on your needs
      }),
    }
  );
  
  if (!res.ok) {
    throw new Error(`Failed to fetch issues: ${res.status} ${await res.text()}`);
  }
  
  const data = await res.json();
  return data.issues || [];
}

export async function getChildrenIssues(parentIssue, project) {
  let jql = `project = ${project} AND parent = ${parentIssue}`;

  console.log(`Searching for work items with parent issue ${parentIssue} in project ${project} with JQL: ${jql}`);

  const res = await asApp().requestJira(
    route`/rest/api/3/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql,
        fields: ['key', 'summary', 'description', 'issuetype'],
        expand: ['names'],
        maxResults: 1000
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to search for ASIL level ${asilLevel}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.issues || data.issues.length === 0) {
    throw new Error(`No issue found for ASIL level ${asilLevel}`);
  }
  console.log(`Found issues for parent issue ${parentIssue} in project ${project}: ${data.issues.map(issue => issue.key).join(", ")}`);
  // Fetch full details for each issue
  return data.issues;
}

// Returns the issue key for the given ASIL level (A, B, C, D, QM) in the FuSaDemo project
export async function getChildrenyIssuesByAsilLevel(parentIssue, asilLevel) {
  let jql = `project = ${sourceProjectKey} AND parent = ${parentIssue} AND ASIL_Level = ${asilLevel} order by key`;

  console.log(`Searching for work items with ASIL level ${asilLevel} with JQL: ${jql}`);

  const res = await asApp().requestJira(
    route`/rest/api/3/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql,
        fields: ['key', 'summary', 'description', 'issuetype'],
        expand: ['names'],
        maxResults: 1000
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to search for ASIL level ${asilLevel}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.issues || data.issues.length === 0) {
    throw new Error(`No issue found for ASIL level ${asilLevel}`);
  }
  console.log(`Found issues for ASIL level ${asilLevel}: ${data.issues.map(issue => issue.key).join(", ")}`);
  return data.issues;
}

// Batch create issues using Promise.all for parallel execution
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function createIssuesBatch(issuePayloads, batchSize = 10, delayMs = 10) {
  console.log(`Creating ${issuePayloads.length} subtasks in batchs of ${batchSize} with ${delayMs}ms delay...`);
  const successful = [];
  const failed = [];

  for (let i = 0; i < issuePayloads.length; i += batchSize) {
    const batch = issuePayloads.slice(i, i + batchSize);
    const createPromises = batch.map(payload => 
      asApp().requestJira(
        route`/rest/api/3/issue`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: payload }),
        }
      )
    );

    const results = await Promise.allSettled(createPromises);

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled' && result.value.ok) {
        const createdIssue = await result.value.json();
        successful.push(createdIssue);
      } else {
        const error = result.status === 'rejected' 
          ? result.reason 
          : `HTTP ${result.value.status}: ${await result.value.text()}`;
        failed.push({ payload: batch[j], error });
      }
    }

    // Delay before the next batch
    await delay(delayMs);
  }

  return { successful, failed };
}

// Create issues sequentially (one by one) instead of in parallel
export async function createIssuesSequentially(issuePayloads, delayMs = 0) {
  const successful = [];
  const failed = [];

  for (let i = 0; i < issuePayloads.length; i++) {
    const payload = issuePayloads[i];
    
    try {
      const response = await asApp().requestJira(
        route`/rest/api/3/issue`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: payload }),
        }
      );

      if (response.ok) {
        const createdIssue = await response.json();
        successful.push(createdIssue);
        console.log(`Successfully created issue ${i + 1}/${issuePayloads.length}: ${createdIssue.key}`);
      } else {
        const errorText = await response.text();
        const error = `HTTP ${response.status}: ${errorText}`;
        failed.push({ payload, error });
        console.error(`Failed to create issue ${i + 1}/${issuePayloads.length}: ${error}`);
      }
    } catch (error) {
      failed.push({ payload, error: error.message || error });
      console.error(`Failed to create issue ${i + 1}/${issuePayloads.length}: ${error.message || error}`);
    }

    // Add delay between requests (except for the last one)
    if (i < issuePayloads.length - 1) {
      await delay(delayMs);
    }
  }

  return { successful, failed };
}

// Pre-fetch and cache issue type mappings for both projects
export async function preloadIssueTypeMappings(sourceProject, targetProject, issueTypeNames) {
  const promises = [];
  
  // Load issue types for both projects in parallel
  promises.push(getProjectIssueTypes(sourceProject));
  promises.push(getProjectIssueTypes(targetProject));
  
  await Promise.all(promises);
  
  // Pre-cache issue type ID mappings for target project
  const targetMappingPromises = issueTypeNames.map(typeName => 
    getIssueTypeIdByName(targetProject, typeName)
  );
  
  await Promise.all(targetMappingPromises);
}