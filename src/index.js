//import { api, route } from '@forge/api';
import { asApp, route } from '@forge/api';
import { getIssueKeyByAsilLevel, preloadIssueTypeMappings, getIssueTypeIdByName, createIssuesBatch, createIssuesSequentially, getChildrenIssues, getChildrenyIssuesByAsilLevel } from './helpers';
import { sourceProjectKey,asilCustomFieldId,sourceEpicKey,carlineCustomFieldId } from './constants.js';

async function takeOverAsilStory(sourceEpicKey, carline) {
  const projectKey = sourceEpicKey.split('-')[0];
   // Fetch source issue and subtasks in parallel
  const [sourceIssueRes, subtasks] = await Promise.all([
    asApp().requestJira(route`/rest/api/3/issue/${sourceEpicKey}?expand=names`),
    getChildrenIssues(sourceEpicKey, projectKey)
  ]);
  
  if (!sourceIssueRes.ok) {
    throw new Error(`Failed to fetch source issue: ${sourceIssueRes.status} ${await sourceIssueRes.text()}`);
  }
  const sourceIssue = await sourceIssueRes.json();
  

  // Create parent issue

  const parentFields = {
    project: { key: projectKey },
    summary: `${sourceIssue.fields.summary} - taken over from ${sourceEpicKey}`,
    issuetype: { id: sourceIssue.fields.issuetype.id },
    description: sourceIssue.fields.description,
    [asilCustomFieldId]: sourceIssue.fields[asilCustomFieldId],
    [carlineCustomFieldId]: carline
  };

  const createParentRes = await asApp().requestJira(
    route`/rest/api/3/issue`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: parentFields }),
    }
  );
  
  if (!createParentRes.ok) {
    throw new Error(`Failed to create parent issue: ${createParentRes.status} ${await createParentRes.text()}`);
  }
  const newParent = await createParentRes.json();
  const newParentKey = newParent.key;

  // Prepare all subtask payloads for sequential creation
  const subtaskPayloads = await Promise.all(
    subtasks.map(async (subtask) => {
      const subtaskTypeName = subtask.fields.issuetype.name;
      const targetSubtaskTypeId = await getIssueTypeIdByName(projectKey, subtaskTypeName);

      return {
        project: { key: projectKey },
        summary: `${subtask.fields.summary}`,
        issuetype: { id: targetSubtaskTypeId },
        parent: { key: newParentKey },
        description: subtask.fields.description,
        [asilCustomFieldId]: sourceIssue.fields[asilCustomFieldId],
        [carlineCustomFieldId]: carline
      };
    })
  );

  // Create all subtasks sequentially
  
  const { successful, failed } = await createIssuesBatch(subtaskPayloads);

  console.log(`Successfully created ${successful.length} subtasks`);
  if (failed.length > 0) {
    console.warn(`Failed to create ${failed.length} subtasks:`, failed);
    // You might want to retry failed creations or handle them differently
  }
  const result = {
    message: `Safety Plan Template ${sourceEpicKey} taken over successfully with ${successful.length} sub-elements.`,
    newIssueKey: newParentKey,
    createdSubtasks: successful.length,
    failedSubtasks: failed.length
  };
  return result;

}

async function cloneAsilStory(targetProject, asilLevel, systemName, carline) {
  // Fetch source issue and subtasks in parallel
  const [sourceIssueRes, subtasks] = await Promise.all([
    asApp().requestJira(route`/rest/api/3/issue/${sourceEpicKey}?expand=names`),
    getChildrenyIssuesByAsilLevel(sourceEpicKey, asilLevel) 
  ]);
  
  if (!sourceIssueRes.ok) {
    throw new Error(`Failed to fetch source issue: ${sourceIssueRes.status} ${await sourceIssueRes.text()}`);
  }
  const sourceIssue = await sourceIssueRes.json();

  // Pre-load issue type mappings for better performance
  const allIssueTypeNames = [
    sourceIssue.fields.issuetype.name,
    ...subtasks.map(subtask => subtask.fields.issuetype.name)
  ];
  const uniqueIssueTypeNames = [...new Set(allIssueTypeNames)];
  
  await preloadIssueTypeMappings(sourceProjectKey, targetProject, uniqueIssueTypeNames);

  // Create parent issue
  const issueTypeName = sourceIssue.fields.issuetype.name;
  const targetIssueTypeId = await getIssueTypeIdByName(targetProject, issueTypeName);

  const parentFields = {
    project: { key: targetProject },
    summary: `System ${systemName} Safety Plan`,
    issuetype: { id: targetIssueTypeId },
    description: sourceIssue.fields.description,
    [asilCustomFieldId]: [ { "value": asilLevel } ],
    [carlineCustomFieldId]: carline
  };

  const createParentRes = await asApp().requestJira(
    route`/rest/api/3/issue`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: parentFields }),
    }
  );
  
  if (!createParentRes.ok) {
    throw new Error(`Failed to create parent issue: ${createParentRes.status} ${await createParentRes.text()}`);
  }
  const newParent = await createParentRes.json();
  const newParentKey = newParent.key;

  // Prepare all subtask payloads for sequential creation
  const subtaskPayloads = await Promise.all(
    subtasks.map(async (subtask) => {
      const subtaskTypeName = subtask.fields.issuetype.name;
      const targetSubtaskTypeId = await getIssueTypeIdByName(targetProject, subtaskTypeName);

      return {
        project: { key: targetProject },
        summary: `${subtask.fields.summary}`,
        issuetype: { id: targetSubtaskTypeId },
        parent: { key: newParentKey },
        description: subtask.fields.description,
        [asilCustomFieldId]: [ { "value": asilLevel } ],
        [carlineCustomFieldId]: carline
      };
    })
  );

  // Create all subtasks sequentially
  
  //const { successful, failed } = await createIssuesSequentially(subtaskPayloads, 0);
  const { successful, failed } = await createIssuesBatch(subtaskPayloads);

  console.log(`Successfully created ${successful.length} subtasks`);
  if (failed.length > 0) {
    console.warn(`Failed to create ${failed.length} subtasks:`, failed);
    // You might want to retry failed creations or handle them differently
  }
  const result = {
    message: `Safety Plan Template ${sourceEpicKey} cloned and moved to project ${targetProject} successfully with ${successful.length} sub-elements.`,
    newIssueKey: newParentKey,
    createdSubtasks: successful.length,
    failedSubtasks: failed.length
  };
  return result;
}

/**
 * @param {import('@forge/api').WebTriggerRequest} event
 * @param {import('@forge/api').WebTriggerContext} context
 * @returns {Promise<import('@forge/api').WebTriggerResponse>}
 */
exports.runAsync = async (event, context) => {
  //console.log(`Received event: ${JSON.stringify(event)}`);
  const params = JSON.parse(event.body);
  console.log(`Received parameters: ${JSON.stringify(params)}`);
  const action = params.action;
  console.log(`Action to perform: ${action}`);
  if (!action) {
    throw new Error('Action parameter is required');
  }
  let result;
  if (action == 'cloneAsilStory') {
    if (!params || !params.targetProject || !params.asilLevel || !params.systemName || !params.carline) {
      throw new Error('Missing required parameters: targetProject, asilLevel, systemName, carline');
    }
    const { targetProject, asilLevel, systemName, carline } = params;
    console.log(`Cloning ASIL story for project ${targetProject} with ASIL level ${asilLevel} for system ${systemName} and carline ${carline}`);
    result = await cloneAsilStory(targetProject, asilLevel, systemName, carline);
    // Log the result of the cloning operation
    console.log(`Cloning result: ${JSON.stringify(result)}`);
  }else if (action == 'takeoverAsilStory') {
    if (!params || !params.epicIssueKey || !params.carline) {
      throw new Error('Missing required parameters: epicIssueKey, carline');
    }
    const {epicIssueKey, carline } = params;
    console.log(`Taking over ASIL story for epic ${epicIssueKey} with carline ${carline}`);
    result = await takeOverAsilStory(epicIssueKey, carline);
  // Log the result of the takeover operation
    console.log(`Takeover result: ${JSON.stringify(result)}`);
  } else {
    throw new Error(`Unknown action: ${action}`);
  }
  

  return {
    statusCode: 200, // or 204
    body: JSON.stringify(result),
    headers: {
      'Content-Type': ['application/json']
    }
  };
};

/**
 * @param {import('@forge/api').WebTriggerRequest} event
 * @param {import('@forge/api').WebTriggerContext} context
 * @returns {import('@forge/api').WebTriggerResponse}
 */
exports.runSync = (event, context) => {
  
};
