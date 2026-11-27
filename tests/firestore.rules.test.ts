import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'todo-pwa-rules-test';
const OWNER_UID = 'owner-uid';
const MEMBER_UID = 'member-uid';
const OTHER_MEMBER_UID = 'member-2-uid';
const OUTSIDER_UID = 'outsider-uid';

describe('Firestore security rules', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'lists', 'list-1'), {
        title: 'Shared Groceries',
        ownerUid: OWNER_UID,
        memberUids: [MEMBER_UID],
        color: 'blue',
        background: 'field',
        customBackgroundActive: false,
      });
      await setDoc(doc(db, 'lists', 'list-no-members'), {
        title: 'Fresh List',
        ownerUid: OWNER_UID,
      });
      await setDoc(doc(db, 'lists', 'list-1', 'items', 'owner-item'), {
        listId: 'list-1',
        ownerUid: OWNER_UID,
        text: 'Buy milk',
        done: false,
      });
      await setDoc(doc(db, 'lists', 'list-1', 'items', 'member-item'), {
        listId: 'list-1',
        ownerUid: MEMBER_UID,
        text: 'Buy bread',
        done: false,
      });
      await setDoc(doc(db, 'groups', 'group-1'), {
        title: 'Work',
        ownerUid: OWNER_UID,
      });
    });
  });

  describe('owner capabilities', () => {
    it('allows owner to read, update settings, manage membership, and delete list', async () => {
      const db = testEnv.authenticatedContext(OWNER_UID).firestore();
      const listRef = doc(db, 'lists', 'list-1');

      await assertSucceeds(getDoc(listRef));
      await assertSucceeds(updateDoc(listRef, { title: 'Weekly Groceries', icon: '🛒' }));
      await assertSucceeds(updateDoc(listRef, { memberUids: arrayUnion(OTHER_MEMBER_UID) }));
      await assertSucceeds(updateDoc(listRef, { memberUids: arrayRemove(MEMBER_UID) }));
      await assertSucceeds(
        setDoc(doc(db, 'lists', 'list-1', 'shares', 'invite-1'), {
          email: 'friend@example.com',
          role: 'member',
        })
      );
      await assertSucceeds(deleteDoc(doc(db, 'lists', 'list-1', 'items', 'member-item')));
      await assertSucceeds(deleteDoc(listRef));
    });

    it('prevents owner from rewriting ownerUid on a list', async () => {
      const db = testEnv.authenticatedContext(OWNER_UID).firestore();
      await assertFails(updateDoc(doc(db, 'lists', 'list-1'), { ownerUid: MEMBER_UID }));
    });
  });

  describe('member capabilities and restrictions', () => {
    it('allows member to read list, change preset theme, collaborate on items, and leave', async () => {
      const db = testEnv.authenticatedContext(MEMBER_UID).firestore();
      const listRef = doc(db, 'lists', 'list-1');

      await assertSucceeds(getDoc(listRef));
      await assertSucceeds(updateDoc(listRef, { color: 'green' }));
      await assertSucceeds(updateDoc(listRef, { background: 'coast', customBackgroundActive: false }));

      // Collaborative item operations
      await assertSucceeds(getDoc(doc(db, 'lists', 'list-1', 'items', 'owner-item')));
      await assertSucceeds(
        updateDoc(doc(db, 'lists', 'list-1', 'items', 'owner-item'), {
          done: true,
          notes: 'Picked up 2%',
        })
      );
      await assertSucceeds(
        setDoc(doc(db, 'lists', 'list-1', 'items', 'new-member-item'), {
          listId: 'list-1',
          ownerUid: MEMBER_UID,
          text: 'Buy eggs',
          done: false,
        })
      );
      // Member can delete their own item
      await assertSucceeds(deleteDoc(doc(db, 'lists', 'list-1', 'items', 'member-item')));
      // Member can leave the list
      await assertSucceeds(updateDoc(listRef, { memberUids: arrayRemove(MEMBER_UID) }));
    });

    it('denies member from modifying protected list fields, membership of others, shares, or deleting list', async () => {
      const db = testEnv.authenticatedContext(MEMBER_UID).firestore();
      const listRef = doc(db, 'lists', 'list-1');

      await assertFails(updateDoc(listRef, { ownerUid: MEMBER_UID }));
      await assertFails(updateDoc(listRef, { title: 'Hijacked' }));
      await assertFails(updateDoc(listRef, { icon: '💀' }));
      await assertFails(updateDoc(listRef, { groupId: 'group-1' }));
      await assertFails(updateDoc(listRef, { customBackgroundActive: true }));
      await assertFails(updateDoc(listRef, { backgroundImageUrl: 'https://evil.example/bg.jpg' }));
      await assertFails(updateDoc(listRef, { memberUids: arrayUnion(OTHER_MEMBER_UID) }));
      await assertFails(updateDoc(listRef, { memberUids: [OTHER_MEMBER_UID] }));
      await assertFails(deleteDoc(listRef));
      await assertFails(
        setDoc(doc(db, 'lists', 'list-1', 'shares', 'invite-1'), {
          email: 'evil@example.com',
        })
      );
    });

    it('denies member from rewriting item ownerUid/listId, spoofing creates, or deleting others items', async () => {
      const db = testEnv.authenticatedContext(MEMBER_UID).firestore();

      await assertFails(
        updateDoc(doc(db, 'lists', 'list-1', 'items', 'owner-item'), {
          ownerUid: MEMBER_UID,
        })
      );
      await assertFails(
        updateDoc(doc(db, 'lists', 'list-1', 'items', 'owner-item'), {
          listId: 'other-list',
        })
      );
      await assertFails(
        setDoc(doc(db, 'lists', 'list-1', 'items', 'spoof-owner'), {
          listId: 'list-1',
          ownerUid: OWNER_UID,
          text: 'Spoofed',
          done: false,
        })
      );
      await assertFails(
        setDoc(doc(db, 'lists', 'list-1', 'items', 'wrong-list'), {
          listId: 'list-other',
          ownerUid: MEMBER_UID,
          text: 'Mismatched listId',
          done: false,
        })
      );
      await assertFails(deleteDoc(doc(db, 'lists', 'list-1', 'items', 'owner-item')));
    });
  });

  describe('self-join share link and unrelated users', () => {
    it('allows signed-in user with list ID to add only their own UID via share link', async () => {
      const db = testEnv.authenticatedContext(OUTSIDER_UID).firestore();

      // Cannot read before joining
      await assertFails(getDoc(doc(db, 'lists', 'list-1')));
      await assertFails(getDoc(doc(db, 'lists', 'list-1', 'items', 'owner-item')));

      // Self-join works both when memberUids exists and when it does not exist yet
      await assertSucceeds(
        updateDoc(doc(db, 'lists', 'list-1'), { memberUids: arrayUnion(OUTSIDER_UID) })
      );
      await assertSucceeds(
        updateDoc(doc(db, 'lists', 'list-no-members'), { memberUids: arrayUnion(OUTSIDER_UID) })
      );

      // Idempotent self-join also succeeds
      await assertSucceeds(
        updateDoc(doc(db, 'lists', 'list-1'), { memberUids: arrayUnion(OUTSIDER_UID) })
      );

      // Can read after joining
      await assertSucceeds(getDoc(doc(db, 'lists', 'list-1')));
    });

    it('denies unrelated user from abusing membership updates or accessing lists/items/groups', async () => {
      const db = testEnv.authenticatedContext(OUTSIDER_UID).firestore();
      const listRef = doc(db, 'lists', 'list-1');

      // Cannot remove existing members while joining
      await assertFails(updateDoc(listRef, { memberUids: [OUTSIDER_UID] }));
      // Cannot add another user instead of self
      await assertFails(updateDoc(listRef, { memberUids: [MEMBER_UID, OTHER_MEMBER_UID] }));
      // Cannot add self plus another user
      await assertFails(updateDoc(listRef, { memberUids: [MEMBER_UID, OUTSIDER_UID, OTHER_MEMBER_UID] }));
      // Cannot duplicate existing member without joining
      await assertFails(updateDoc(listRef, { memberUids: [MEMBER_UID, MEMBER_UID] }));
      // Cannot change another field while joining
      await assertFails(
        updateDoc(listRef, {
          memberUids: arrayUnion(OUTSIDER_UID),
          title: 'Taken over',
        })
      );
      // Cannot read or write items
      await assertFails(getDoc(doc(db, 'lists', 'list-1', 'items', 'owner-item')));
      await assertFails(
        setDoc(doc(db, 'lists', 'list-1', 'items', 'outsider-item'), {
          listId: 'list-1',
          ownerUid: OUTSIDER_UID,
          text: 'Unauthorized',
          done: false,
        })
      );
      // Cannot access owner's group
      await assertFails(getDoc(doc(db, 'groups', 'group-1')));
      await assertFails(updateDoc(doc(db, 'groups', 'group-1'), { title: 'Hacked' }));
      await assertFails(deleteDoc(doc(db, 'groups', 'group-1')));
    });
  });

  describe('groups remain owner-only', () => {
    it('allows owner CRUD on groups while keeping ownerUid immutable', async () => {
      const db = testEnv.authenticatedContext(OWNER_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'groups', 'group-1')));
      await assertSucceeds(updateDoc(doc(db, 'groups', 'group-1'), { title: 'Work & Projects' }));
      await assertFails(updateDoc(doc(db, 'groups', 'group-1'), { ownerUid: MEMBER_UID }));
      await assertSucceeds(deleteDoc(doc(db, 'groups', 'group-1')));
    });
  });

  describe('app collection and collectionGroup queries', () => {
    it('allows all app queries for owners and members and denies unfiltered queries', async () => {
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
      const memberDb = testEnv.authenticatedContext(MEMBER_UID).firestore();
      const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore();

      // Owned lists query
      await assertSucceeds(
        getDocs(query(collection(ownerDb, 'lists'), where('ownerUid', '==', OWNER_UID)))
      );
      // Shared lists query (array-contains)
      await assertSucceeds(
        getDocs(query(collection(memberDb, 'lists'), where('memberUids', 'array-contains', MEMBER_UID)))
      );
      await assertSucceeds(
        getDocs(query(collection(outsiderDb, 'lists'), where('memberUids', 'array-contains', OUTSIDER_UID)))
      );
      // Owned items collectionGroup query
      await assertSucceeds(
        getDocs(query(collectionGroup(ownerDb, 'items'), where('ownerUid', '==', OWNER_UID)))
      );
      // Owned groups query
      await assertSucceeds(
        getDocs(query(collection(ownerDb, 'groups'), where('ownerUid', '==', OWNER_UID)))
      );
      // Shared list items subcollection query
      await assertSucceeds(getDocs(collection(memberDb, 'lists', 'list-1', 'items')));

      // Unfiltered lists query must still be denied
      await assertFails(getDocs(collection(outsiderDb, 'lists')));
      // Outsider reading items of list-1 must still be denied
      await assertFails(getDocs(collection(outsiderDb, 'lists', 'list-1', 'items')));
    });
  });

  describe('shared list live presence rules', () => {
    it('allows members to read presence and manage only their own presence doc while blocking outsiders', async () => {
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
      const memberDb = testEnv.authenticatedContext(MEMBER_UID).firestore();
      const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore();

      // Owner and member can write their own presence docs
      await assertSucceeds(
        setDoc(doc(ownerDb, 'lists', 'list-1', 'presence', OWNER_UID), {
          uid: OWNER_UID,
          displayName: 'Owner',
          lastActiveAtMs: Date.now(),
          typingContext: null,
        })
      );
      await assertSucceeds(
        setDoc(doc(memberDb, 'lists', 'list-1', 'presence', MEMBER_UID), {
          uid: MEMBER_UID,
          displayName: 'Member',
          lastActiveAtMs: Date.now(),
          typingContext: 'add-task',
        })
      );

      // Members can read each other's presence
      await assertSucceeds(getDocs(collection(memberDb, 'lists', 'list-1', 'presence')));
      await assertSucceeds(getDoc(doc(ownerDb, 'lists', 'list-1', 'presence', MEMBER_UID)));

      // Member cannot impersonate owner or spoof uid field
      await assertFails(
        setDoc(doc(memberDb, 'lists', 'list-1', 'presence', OWNER_UID), {
          uid: OWNER_UID,
          displayName: 'Spoofed',
          lastActiveAtMs: Date.now(),
        })
      );
      await assertFails(
        setDoc(doc(memberDb, 'lists', 'list-1', 'presence', MEMBER_UID), {
          uid: OWNER_UID,
          displayName: 'Mismatched',
          lastActiveAtMs: Date.now(),
        })
      );
      await assertFails(deleteDoc(doc(memberDb, 'lists', 'list-1', 'presence', OWNER_UID)));

      // Member can clean up own presence doc
      await assertSucceeds(deleteDoc(doc(memberDb, 'lists', 'list-1', 'presence', MEMBER_UID)));

      // Outsider cannot read or write presence
      await assertFails(getDocs(collection(outsiderDb, 'lists', 'list-1', 'presence')));
      await assertFails(
        setDoc(doc(outsiderDb, 'lists', 'list-1', 'presence', OUTSIDER_UID), {
          uid: OUTSIDER_UID,
          displayName: 'Outsider',
          lastActiveAtMs: Date.now(),
        })
      );
    });
  });
});
