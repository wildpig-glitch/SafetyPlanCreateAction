import { 
  sourceProjectKey, 
  issueTypeCache, 
  projectCache, 
  asilCustomFieldId, 
  carlineCustomFieldId, 
  sourceEpicKey 
} from '../constants';

describe('Constants', () => {
  it('should export sourceProjectKey as a string', () => {
    expect(typeof sourceProjectKey).toBe('string');
    expect(sourceProjectKey).toBe('FS');
  });

  it('should export issueTypeCache as a Map', () => {
    expect(issueTypeCache).toBeInstanceOf(Map);
    expect(issueTypeCache.size).toBe(0); // Should be empty initially
  });

  it('should export projectCache as a Map', () => {
    expect(projectCache).toBeInstanceOf(Map);
    expect(projectCache.size).toBe(0); // Should be empty initially
  });

  it('should export asilCustomFieldId as a string', () => {
    expect(typeof asilCustomFieldId).toBe('string');
    expect(asilCustomFieldId).toBe('customfield_10091');
  });

  it('should export carlineCustomFieldId as a string', () => {
    expect(typeof carlineCustomFieldId).toBe('string');
    expect(carlineCustomFieldId).toBe('customfield_10190');
  });

  it('should export sourceEpicKey as a string', () => {
    expect(typeof sourceEpicKey).toBe('string');
    expect(sourceEpicKey).toBe('FS-91');
  });
});