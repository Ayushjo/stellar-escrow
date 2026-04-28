#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    token, Address, Env, String,
};

// ── Data Types ────────────────────────────────────────────────────────────────

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum EscrowStatus {
    Active,
    Released,
    Refunded,
}

#[contracttype]
pub struct Escrow {
    pub creator:   Address,
    pub recipient: Address,
    pub amount:    i128,
    pub deadline:  u64,
    pub status:    EscrowStatus,
    pub title:     String,
    pub created_at: u64,
}

#[contracttype]
enum DataKey {
    Escrow(u64),
    Count,
    Token,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize with the native token contract address (call once after deploy)
    pub fn init(env: Env, token: Address) {
        if env.storage().instance().has(&DataKey::Token) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Count, &0u64);
        env.storage().instance().extend_ttl(200_000, 200_000);
    }

    /// Create and fund an escrow in one step.
    /// XLM is transferred from creator → contract immediately.
    /// deadline is a UNIX timestamp (seconds).
    pub fn create(
        env: Env,
        creator: Address,
        recipient: Address,
        amount: i128,
        deadline: u64,
        title: String,
    ) -> u64 {
        creator.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }
        if deadline <= env.ledger().timestamp() {
            panic!("deadline must be in the future");
        }

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token).transfer(
            &creator,
            &env.current_contract_address(),
            &amount,
        );

        let id: u64 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        let escrow = Escrow {
            creator: creator.clone(),
            recipient,
            amount,
            deadline,
            status: EscrowStatus::Active,
            title,
            created_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::Escrow(id), &escrow);
        env.storage().persistent().extend_ttl(&DataKey::Escrow(id), 200_000, 200_000);
        env.storage().instance().set(&DataKey::Count, &(id + 1));

        env.events()
            .publish((symbol_short!("create"), creator), (id, amount));

        id
    }

    /// Creator releases funds to the recipient.
    pub fn release(env: Env, caller: Address, id: u64) {
        caller.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(id))
            .unwrap_or_else(|| panic!("escrow not found"));

        if caller != escrow.creator {
            panic!("only creator can release");
        }
        if escrow.status != EscrowStatus::Active {
            panic!("escrow not active");
        }

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &escrow.recipient,
            &escrow.amount,
        );

        escrow.status = EscrowStatus::Released;
        env.storage().persistent().set(&DataKey::Escrow(id), &escrow);

        env.events()
            .publish((symbol_short!("release"), id), escrow.recipient);
    }

    /// Creator claims a refund after deadline passes.
    pub fn refund(env: Env, caller: Address, id: u64) {
        caller.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&DataKey::Escrow(id))
            .unwrap_or_else(|| panic!("escrow not found"));

        if caller != escrow.creator {
            panic!("only creator can refund");
        }
        if escrow.status != EscrowStatus::Active {
            panic!("escrow not active");
        }
        if env.ledger().timestamp() < escrow.deadline {
            panic!("deadline not reached");
        }

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &escrow.creator,
            &escrow.amount,
        );

        escrow.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&DataKey::Escrow(id), &escrow);

        env.events()
            .publish((symbol_short!("refund"), id), escrow.creator);
    }

    /// Read an escrow by ID.
    pub fn get_escrow(env: Env, id: u64) -> Option<Escrow> {
        env.storage().persistent().get(&DataKey::Escrow(id))
    }

    /// Total number of escrows ever created.
    pub fn count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger, LedgerInfo},
        token::{Client as TokenClient, StellarAssetClient},
        Env, String,
    };

    struct TestSetup {
        env: Env,
        contract: EscrowContractClient<'static>,
        token_id: Address,
        creator: Address,
        recipient: Address,
    }

    fn setup() -> TestSetup {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy the escrow contract
        let contract_id = env.register_contract(None, EscrowContract);
        let contract = EscrowContractClient::new(&env, &contract_id);

        // Create a test token (simulates native XLM)
        let admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = token_contract.address();
        let sac = StellarAssetClient::new(&env, &token_id);

        // Initialize the escrow contract with the token
        contract.init(&token_id);

        let creator = Address::generate(&env);
        let recipient = Address::generate(&env);

        // Fund creator with 1000 XLM (in stroops: 1 XLM = 10_000_000)
        sac.mint(&creator, &(1_000 * 10_000_000i128));

        TestSetup { env, contract, token_id, creator, recipient }
    }

    // ── Test 1: Create escrow ─────────────────────────────────────────────────
    #[test]
    fn test_create_escrow() {
        let s = setup();
        let token = TokenClient::new(&s.env, &s.token_id);

        let deadline = s.env.ledger().timestamp() + 86_400; // +1 day
        let id = s.contract.create(
            &s.creator,
            &s.recipient,
            &(100 * 10_000_000i128),
            &deadline,
            &String::from_str(&s.env, "Website redesign"),
        );

        assert_eq!(id, 0, "first escrow should have id 0");
        assert_eq!(s.contract.count(), 1, "count should be 1");

        // Verify funds moved to contract
        assert_eq!(
            token.balance(&s.creator),
            900 * 10_000_000i128,
            "creator should have 900 XLM"
        );

        // Verify escrow state
        let escrow = s.contract.get_escrow(&0).unwrap();
        assert_eq!(escrow.amount, 100 * 10_000_000i128);
        assert_eq!(escrow.status, EscrowStatus::Active);
    }

    // ── Test 2: Release escrow pays recipient ─────────────────────────────────
    #[test]
    fn test_release_pays_recipient() {
        let s = setup();
        let token = TokenClient::new(&s.env, &s.token_id);

        let deadline = s.env.ledger().timestamp() + 86_400;
        s.contract.create(
            &s.creator,
            &s.recipient,
            &(50 * 10_000_000i128),
            &deadline,
            &String::from_str(&s.env, "Logo design"),
        );

        let before = token.balance(&s.recipient);
        s.contract.release(&s.creator, &0);
        let after = token.balance(&s.recipient);

        assert_eq!(
            after - before,
            50 * 10_000_000i128,
            "recipient should receive 50 XLM"
        );
        assert_eq!(
            s.contract.get_escrow(&0).unwrap().status,
            EscrowStatus::Released
        );
    }

    // ── Test 3: Refund after deadline ─────────────────────────────────────────
    #[test]
    fn test_refund_after_deadline() {
        let s = setup();
        let token = TokenClient::new(&s.env, &s.token_id);

        let deadline = s.env.ledger().timestamp() + 100;
        s.contract.create(
            &s.creator,
            &s.recipient,
            &(200 * 10_000_000i128),
            &deadline,
            &String::from_str(&s.env, "Dev work"),
        );

        // Advance ledger past deadline
        s.env.ledger().set(LedgerInfo {
            timestamp: deadline + 1,
            protocol_version: 22,
            sequence_number: 100,
            network_id: Default::default(),
            base_reserve: 5_000_000,
            min_temp_entry_ttl: 16,
            min_persistent_entry_ttl: 4096,
            max_entry_ttl: 6_312_000,
        });

        let before = token.balance(&s.creator);
        s.contract.refund(&s.creator, &0);
        let after = token.balance(&s.creator);

        assert_eq!(after - before, 200 * 10_000_000i128, "creator should get refund");
        assert_eq!(
            s.contract.get_escrow(&0).unwrap().status,
            EscrowStatus::Refunded
        );
    }

    // ── Test 4: Cannot release twice ─────────────────────────────────────────
    #[test]
    #[should_panic(expected = "escrow not active")]
    fn test_cannot_release_twice() {
        let s = setup();
        let deadline = s.env.ledger().timestamp() + 86_400;
        s.contract.create(
            &s.creator,
            &s.recipient,
            &(10 * 10_000_000i128),
            &deadline,
            &String::from_str(&s.env, "test"),
        );
        s.contract.release(&s.creator, &0);
        s.contract.release(&s.creator, &0); // should panic
    }

    // ── Test 5: Cannot refund before deadline ─────────────────────────────────
    #[test]
    #[should_panic(expected = "deadline not reached")]
    fn test_cannot_refund_before_deadline() {
        let s = setup();
        let deadline = s.env.ledger().timestamp() + 86_400;
        s.contract.create(
            &s.creator,
            &s.recipient,
            &(10 * 10_000_000i128),
            &deadline,
            &String::from_str(&s.env, "test"),
        );
        s.contract.refund(&s.creator, &0); // should panic — deadline not reached
    }

    // ── Test 6: Multiple escrows incrementing IDs ─────────────────────────────
    #[test]
    fn test_multiple_escrows() {
        let s = setup();
        let deadline = s.env.ledger().timestamp() + 86_400;

        let id0 = s.contract.create(
            &s.creator, &s.recipient, &(10 * 10_000_000i128), &deadline,
            &String::from_str(&s.env, "job 1"),
        );
        let id1 = s.contract.create(
            &s.creator, &s.recipient, &(20 * 10_000_000i128), &deadline,
            &String::from_str(&s.env, "job 2"),
        );

        assert_eq!(id0, 0);
        assert_eq!(id1, 1);
        assert_eq!(s.contract.count(), 2);
    }
}
