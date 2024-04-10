import { Reverter } from "@/test/helpers/reverter";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Beacon, ERC20Mock, Registry, SimpleStrategyMock__factory, StrategyMock__factory } from "@/typechain-types";
import { ethers } from "hardhat";
import { afterEach } from "mocha";
import { expect } from "chai";

describe("Registry", () => {
  const reverter = new Reverter();

  let registry: Registry;
  let beacon: Beacon;
  let asset1: ERC20Mock;
  let asset2: ERC20Mock;

  let strategyFactory: SimpleStrategyMock__factory;

  let OWNER: HardhatEthersSigner;
  let BOB: HardhatEthersSigner;
  let ALICE: HardhatEthersSigner;
  let TREASURY: HardhatEthersSigner;

  before(async () => {
    [OWNER, BOB, ALICE, TREASURY] = await ethers.getSigners();
    const Vault = await ethers.getContractFactory("Vault");
    const Beacon = await ethers.getContractFactory("Beacon");
    const Registry = await ethers.getContractFactory("Registry");
    const ERC20 = await ethers.getContractFactory("ERC20Mock");

    strategyFactory = await ethers.getContractFactory("SimpleStrategyMock");

    const vaultImpl = await Vault.deploy();
    beacon = await Beacon.deploy(vaultImpl.target, OWNER);
    registry = await Registry.deploy(beacon.target, OWNER, TREASURY.address);
    asset1 = await ERC20.deploy("Mock", "MK", 18);
    asset2 = await ERC20.deploy("Mock", "MK", 18);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("deployVault", () => {
    it("should deploy new proxy vault", async () => {
      const proxyAddress = await registry.deployVault.staticCall(asset1.target, "Vault", "VLT", 10n, 50n);
      await registry.deployVault(asset1.target, "Vault", "VLT", 10n, 50n);

      const proxy = await ethers.getContractAt("Vault", proxyAddress);

      expect(await registry.vaults(asset1.target, 0)).to.be.eq(proxy.target);
      expect(await proxy.name()).to.be.eq("Vault");
      expect(await proxy.symbol()).to.be.eq("VLT");
      expect(await proxy.registry()).to.be.eq(registry.target);
      expect(await proxy.asset()).to.be.eq(asset1.target);
      expect(await proxy.protocolFee()).to.be.eq(10n);
      expect(await proxy.executorFee()).to.be.eq(50n);
    });

    it("should deploy 3 proxy", async () => {
      await registry.deployVault(asset1.target, "Vault1", "1", 10n, 50n);
      await registry.deployVault(asset1.target, "Vault2", "2", 10n, 50n);
      await registry.deployVault(asset1.target, "Vault3", "3", 10n, 50n);

      expect(await registry.vaults(asset1.target, 0)).to.be.not.null;
      expect(await registry.vaults(asset1.target, 1)).to.be.not.null;
      expect(await registry.vaults(asset1.target, 2)).to.be.not.null;
    });

    it("should revert if caller not an owner", async () => {
      await expect(
        registry.connect(ALICE).deployVault(asset1.target, "Vault", "VLT", 10n, 50n),
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  describe("registerStrategy", () => {
    it("should register", async () => {
      const strategy = await strategyFactory.deploy([asset1.target, asset2.target], OWNER.address, registry.target);
      await registry.registerStrategy(strategy.target);

      expect(await registry.strategies(asset1.target, 0)).to.be.eq(strategy.target);
      expect(await registry.strategies(asset2.target, 0)).to.be.eq(strategy.target);
    });

    it("should revert if caller not an owner", async () => {
      const strategy = await strategyFactory.deploy([asset1.target, asset2.target], OWNER.address, registry.target);
      await expect(registry.connect(ALICE).registerStrategy(strategy.target)).to.be.revertedWithCustomError(
        registry,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("injectStrategy", () => {
    it("should inject strategy into vault", async () => {
      const strategy = await strategyFactory.deploy([asset1.target, asset2.target], OWNER.address, registry.target);
      await registry.registerStrategy(strategy.target);
      await registry.deployVault(asset1.target, "Vault", "VLT", 10n, 50n);

      const vault = await ethers.getContractAt("Vault", await registry.vaults(asset1.target, 0));

      await registry.injectStrategy(asset1.target, 0, 0);

      expect(await vault.getStrategies()).to.deep.eq([strategy.target]);
      expect((await strategy.vaults())[0]).to.be.eq(vault.target);
    });

    it("should revert if caller not an owner", async () => {
      const strategy = await strategyFactory.deploy([asset1.target, asset2.target], OWNER.address, registry.target);
      await registry.registerStrategy(strategy.target);
      await registry.deployVault(asset1.target, "Vault", "VLT", 10n, 50n);

      await expect(registry.connect(ALICE).injectStrategy(asset1.target, 0, 0)).to.be.revertedWithCustomError(
        registry,
        "OwnableUnauthorizedAccount",
      );
    });
  });
});
