import { asApp, route } from '@forge/api';
import { 
  getIssueTypeIdByName, 
  getChildrenIssues, 
  getChildrenyIssuesByAsilLevel,
  createIssuesBatch,
  preloadIssueTypeMappings
} from '../helpers';
import { sourceProjectKey, issueTypeCache, projectCache } from '../constants';

// Mock the Forge API
jest.mock('@forge/api', () => ({
  asApp: jest.fn(),
  route: jest.fn((strings, ...values) => strings.map((str, i) => str + (values[i] || '')).join(''))
}));

describe('Helper Functions', () => {
  beforeEach(() => {
    // Clear caches before each test
    issueTypeCache.clear();
    projectCache.clear();
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('getIssueTypeIdByName', () => {
    it('should return issue type ID from cache if available', async () => {
      // Setup cache with mock data
      issueTypeCache.set('TEST-Story', 'mock-id-123');
      
      const result = await getIssueTypeIdByName('TEST', 'Story');
      
      expect(result).toBe('mock-id-123');
      // Verify API was not called since we used cached value
      expect(asApp).not.toHaveBeenCalled();
    });

    it('should fetch issue type ID if not in cache', async () => {
      // Mock API response
      const mockRequestJira = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          issueTypes: [
            { id: 'type-1', name: 'Bug' },
            { id: 'type-2', name: 'Story' },
            { id: 'type-3', name: 'Task' }
          ]
        })
      });
      asApp.mockReturnValue({ requestJira: mockRequestJira });
      
      const result = await getIssueTypeIdByName('TEST', 'Story');
      
      expect(result).toBe('type-2');
      expect(mockRequestJira).toHaveBeenCalledWith('/rest/api/3/project/TEST');
      // Verify it was cached
      expect(issueTypeCache.get('TEST-Story')).toBe('type-2');
    });

    it('should throw error if issue type not found', async () => {
      // Mock API response with no matching issue type
      const mockRequestJira = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          issueTypes: [
            { id: 'type-1', name: 'Bug' },
            { id: 'type-3', name: 'Task' }
          ]
        })
      });
      asApp.mockReturnValue({ requestJira: mockRequestJira });
      
      await expect(getIssueTypeIdByName('TEST', 'Story'))
        .rejects
        .toThrow('Issue type "Story" not found in project "TEST"');
    });
  });

  describe('getChildrenIssues', () => {
    it('should fetch child issues for a parent issue', async () => {
      const mockIssues = [
        { key: 'TEST-101', fields: { summary: 'Child 1' } },
        { key: 'TEST-102', fields: { summary: 'Child 2' } }
      ];
      
      const mockRequestJira = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          issues: mockIssues
        })
      });
      asApp.mockReturnValue({ requestJira: mockRequestJira });
      
      const result = await getChildrenIssues('TEST-100', 'TEST');
      
      expect(result).toEqual(mockIssues);
      expect(mockRequestJira).toHaveBeenCalled();
      // Verify the JQL query includes the parent issue
      expect(mockRequestJira.mock.calls[0][1].body).toContain('TEST-100');
    });

    it('should throw error if API request fails', async () => {
      const mockRequestJira = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad request')
      });
      asApp.mockReturnValue({ requestJira: mockRequestJira });
      
      await expect(getChildrenIssues('TEST-100', 'TEST'))
        .rejects
        .toThrow();
    });
  });

  describe('getChildrenyIssuesByAsilLevel', () => {
    it('should fetch child issues with specific ASIL level', async () => {
      const mockIssues = [
        { key: 'FS-101', fields: { summary: 'ASIL B Task 1' } },
        { key: 'FS-102', fields: { summary: 'ASIL B Task 2' } }
      ];
      
      const mockRequestJira = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          issues: mockIssues
        })
      });
      asApp.mockReturnValue({ requestJira: mockRequestJira });
      
      const result = await getChildrenyIssuesByAsilLevel('FS-100', 'B');
      
      expect(result).toEqual(mockIssues);
      expect(mockRequestJira).toHaveBeenCalled();
      // Verify the JQL query includes the ASIL level
      const requestBody = JSON.parse(mockRequestJira.mock.calls[0][1].body);
      expect(requestBody.jql).toContain('ASIL_Level = B');
    });

    it('should throw error if no issues found for ASIL level', async () => {
      const mockRequestJira = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          issues: []
        })
      });
      asApp.mockReturnValue({ requestJira: mockRequestJira });
      
      await expect(getChildrenyIssuesByAsilLevel('FS-100', 'D'))
        .rejects
        .toThrow('No issue found for ASIL level D');
    });
  });

  describe('createIssuesBatch', () => {
    it('should create issues in batches and return successful and failed results', async () => {
      const mockPayloads = [
        { summary: 'Issue 1' },
        { summary: 'Issue 2' },
        { summary: 'Issue 3' }
      ];
      
      // Mock successful and failed responses
      const mockRequestJira = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ key: 'TEST-101' })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: jest.fn().mockResolvedValue('Invalid field')
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ key: 'TEST-103' })
        });
      
      asApp.mockReturnValue({ requestJira: mockRequestJira });
      
      const result = await createIssuesBatch(mockPayloads, 3, 0); // No delay for testing
      
      expect(result.successful.length).toBe(2);
      expect(result.failed.length).toBe(1);
      expect(result.successful[0]).toEqual({ key: 'TEST-101' });
      expect(result.successful[1]).toEqual({ key: 'TEST-103' });
      expect(result.failed[0].payload).toEqual({ summary: 'Issue 2' });
    });
  });

  describe('preloadIssueTypeMappings', () => {
    it('should preload issue type mappings for source and target projects', async () => {
      // Mock project issue types
      const mockSourceTypes = [
        { id: 'type-1', name: 'Story' },
        { id: 'type-2', name: 'Task' }
      ];
      
      const mockTargetTypes = [
        { id: 'type-3', name: 'Story' },
        { id: 'type-4', name: 'Task' }
      ];
      
      const mockRequestJira = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ issueTypes: mockSourceTypes })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ issueTypes: mockTargetTypes })
        });
      
      asApp.mockReturnValue({ requestJira: mockRequestJira });
      
      await preloadIssueTypeMappings('SOURCE', 'TARGET', ['Story', 'Task']);
      
      // Verify cache was populated
      expect(projectCache.get('SOURCE')).toEqual(mockSourceTypes);
      expect(projectCache.get('TARGET')).toEqual(mockTargetTypes);
      expect(issueTypeCache.get('TARGET-Story')).toBe('type-3');
      expect(issueTypeCache.get('TARGET-Task')).toBe('type-4');
    });
  });
});