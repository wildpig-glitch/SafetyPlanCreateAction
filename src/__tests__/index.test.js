import { asApp, route } from '@forge/api';
import * as helpers from '../helpers';
// Import the module with the exported functions
import * as indexModule from '../index';
import { sourceProjectKey, asilCustomFieldId, carlineCustomFieldId, sourceEpicKey } from '../constants';

// Mock the Forge API
jest.mock('@forge/api', () => ({
  asApp: jest.fn(),
  route: jest.fn((strings, ...values) => strings.map((str, i) => str + (values[i] || '')).join(''))
}));

// Mock the helper functions
jest.mock('../helpers', () => ({
  getIssueTypeIdByName: jest.fn(),
  getChildrenIssues: jest.fn(),
  getChildrenyIssuesByAsilLevel: jest.fn(),
  createIssuesBatch: jest.fn(),
  createIssuesSequentially: jest.fn(),
  preloadIssueTypeMappings: jest.fn()
}));

describe('Index Functions', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('runAsync', () => {
    it('should throw error if action parameter is missing', async () => {
      const event = { body: JSON.stringify({}) };
      
      await expect(indexModule.runAsync(event, {}))
        .rejects
        .toThrow('Action parameter is required');
    });

    it('should throw error if required parameters for cloneAsilStory are missing', async () => {
      const event = { body: JSON.stringify({ action: 'cloneAsilStory' }) };
      
      await expect(indexModule.runAsync(event, {}))
        .rejects
        .toThrow('Missing required parameters: targetProject, asilLevel, systemName, carline');
    });

    it('should throw error if required parameters for takeoverAsilStory are missing', async () => {
      const event = { body: JSON.stringify({ action: 'takeoverAsilStory' }) };
      
      await expect(indexModule.runAsync(event, {}))
        .rejects
        .toThrow('Missing required parameters: epicIssueKey, carline');
    });

    it('should throw error for unknown action', async () => {
      const event = { body: JSON.stringify({ action: 'unknownAction' }) };
      
      await expect(indexModule.runAsync(event, {}))
        .rejects
        .toThrow('Unknown action: unknownAction');
    });
  });

  describe('cloneAsilStory', () => {
    it('should successfully clone an ASIL story', async () => {
      // Setup mock data
      const sourceIssue = {
        fields: {
          summary: 'Source Issue',
          description: 'Description',
          issuetype: { id: 'type-1', name: 'Epic' }
        }
      };
      
      const subtasks = [
        {
          fields: {
            summary: 'Subtask 1',
            description: 'Subtask Description',
            issuetype: { id: 'type-2', name: 'Task' }
          }
        }
      ];
      
      // Mock API responses
      const mockRequestJira = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(sourceIssue)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ key: 'TARGET-100' })
        });
      
      asApp.mockReturnValue({ requestJira: mockRequestJira });
      
      // Mock helper functions
      helpers.getChildrenyIssuesByAsilLevel.mockResolvedValue(subtasks);
      helpers.getIssueTypeIdByName.mockResolvedValue('type-1');
      helpers.createIssuesSequentially.mockResolvedValue({
        successful: [{ key: 'TARGET-101' }],
        failed: []
      });
      
      // Execute the function via runAsync
      const event = {
        body: JSON.stringify({
          action: 'cloneAsilStory',
          targetProject: 'TARGET',
          asilLevel: 'B',
          systemName: 'Test System',
          carline: 'Test Car'
        })
      };
      
      const result = await indexModule.runAsync(event, {});
      
      // Verify the result
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(expect.objectContaining({
        newIssueKey: 'TARGET-100',
        createdSubtasks: 1,
        failedSubtasks: 0
      }));
      
      // Verify API calls
      expect(helpers.getChildrenyIssuesByAsilLevel).toHaveBeenCalledWith(sourceEpicKey, 'B');
      expect(mockRequestJira).toHaveBeenCalledTimes(2);
    });
  });

  describe('takeOverAsilStory', () => {
    it('should successfully take over an ASIL story', async () => {
      // Setup mock data
      const sourceIssue = {
        fields: {
          summary: 'Source Issue',
          description: 'Description',
          issuetype: { id: 'type-1' },
          [asilCustomFieldId]: 'B',
        }
      };
      
      const subtasks = [
        {
          fields: {
            summary: 'Subtask 1',
            description: 'Subtask Description',
            issuetype: { id: 'type-2', name: 'Task' }
          }
        }
      ];
      
      // Mock API responses
      const mockRequestJira = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(sourceIssue)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ key: 'FS-200' })
        });
      
      asApp.mockReturnValue({ requestJira: mockRequestJira });
      
      // Mock helper functions
      helpers.getChildrenIssues.mockResolvedValue(subtasks);
      helpers.getIssueTypeIdByName.mockResolvedValue('type-2');
      helpers.createIssuesSequentially.mockResolvedValue({
        successful: [{ key: 'FS-201' }],
        failed: []
      });
      
      // Execute the function via runAsync
      const event = {
        body: JSON.stringify({
          action: 'takeoverAsilStory',
          epicIssueKey: 'FS-100',
          carline: 'Test Car'
        })
      };
      
      const result = await indexModule.runAsync(event, {});
      
      // Verify the result
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(expect.objectContaining({
        newIssueKey: 'FS-200',
        createdSubtasks: 1,
        failedSubtasks: 0
      }));
      
      // Verify API calls
      expect(helpers.getChildrenIssues).toHaveBeenCalledWith('FS-100', 'FS');
      expect(mockRequestJira).toHaveBeenCalledTimes(2);
    });
  });
});