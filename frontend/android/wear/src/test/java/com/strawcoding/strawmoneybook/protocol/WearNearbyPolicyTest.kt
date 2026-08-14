package com.strawcoding.strawmoneybook.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WearNearbyPolicyTest {
    @Test
    fun nearbyFirstBlocksNonNearby() {
        assertFalse(WearNearbyPolicy.maySend(false))
        assertTrue(WearNearbyPolicy.maySend(true))
    }

    @Test
    fun pathWhitelistMatchesPhoneContract() {
        assertTrue(WearPaths.isAllowed("/smb/v1/tx/create"))
        assertTrue(WearPaths.isAllowed("/smb/v1/tx/ack"))
        assertFalse(WearPaths.isAllowed("/smb/v1/secret"))
        assertEquals("wear:abc", WearPaths.externalRefId("abc"))
    }
}
