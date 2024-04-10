import { Reverter } from "@/test/helpers/reverter";
import { Beacon, ERC20Mock, Registry, SimpleStrategyMock, StrategyMock, Vault } from "@/typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { afterEach } from "mocha";
import { expect } from "chai";

describe("Vault", () => {
  const reverter = new Reverter();

  let registry: Registry;
  let vaultProxy: Vault;
  let beacon: Beacon;
  let strategy1: SimpleStrategyMock;
  let strategy2: SimpleStrategyMock;

  let asset: ERC20Mock;
  let want1: ERC20Mock;
  // let want2: ERC20Mock;

  let OWNER: HardhatEthersSigner;
  let BOB: HardhatEthersSigner;
  let ALICE: HardhatEthersSigner;
  let TREASURY: HardhatEthersSigner;

  before(async () => {
    [OWNER, BOB, ALICE, TREASURY] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("Registry");
    const Vault = await ethers.getContractFactory("Vault");
    const Strategy = await ethers.getContractFactory("SimpleStrategyMock");
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    const Beacon = await ethers.getContractFactory("Beacon");

    const vaultImpl = await Vault.deploy();
    beacon = await Beacon.deploy(vaultImpl.target, OWNER);
    registry = await Registry.deploy(beacon.target, OWNER, TREASURY);

    asset = await ERC20Mock.deploy("asset", "AST", 18);
    want1 = await ERC20Mock.deploy("want1", "W1", 18);
    // want1 = await ERC20Mock.deploy("want2","W2",18);

    strategy1 = await Strategy.deploy([asset.target, want1.target], OWNER.address, registry.target);
    strategy2 = await Strategy.deploy([asset.target], OWNER.address, registry.target);

    const proxy = await registry.deployVault.staticCall(asset.target, "Vault", "VLT", 10n ** 26n, 10n ** 25n);
    await registry.deployVault(asset.target, "Vault", "VLT", 10n ** 26n, 10n ** 25n);
    vaultProxy = await ethers.getContractAt("Vault", proxy);

    await registry.registerStrategy(strategy1.target);
    await registry.registerStrategy(strategy2.target);
    await registry.injectStrategy(asset.target, 0, 0);
    await registry.injectStrategy(asset.target, 0, 1);

    await asset.mint(ALICE.address, 100n * 10n ** 18n);
    await asset.mint(BOB.address, 100n * 10n ** 18n);
    await asset.connect(ALICE).approve(vaultProxy.target, 100n * 10n ** 18n);
    await asset.connect(BOB).approve(vaultProxy.target, 100n * 10n ** 18n);

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("init", () => {
    it("should revert if init twice", async () => {
      await expect(
        vaultProxy.__Vault_init(OWNER.address, asset.target, registry.target, "Name", "Symbol", 5n, 3n),
      ).to.be.revertedWithCustomError(vaultProxy, "InvalidInitialization");
    });
  });

  describe("addStrategy", () => {
    it("should correctly return added strategies", async () => {
      expect(await vaultProxy.getStrategies()).to.deep.eq([strategy1.target, strategy2.target]);
    });

    it("should correctly add", async () => {
      await registry.injectStrategy(asset.target, 0, 1);
      expect(await vaultProxy.getStrategies()).to.deep.eq([strategy1.target, strategy2.target]);
    });

    it("should test `onlyRegistry` modifier", async () => {
      await expect(vaultProxy.addStrategy(strategy1.target)).to.be.revertedWith("Vault: caller not registry");
    });
  });

  describe("setStrategiesPercents", () => {
    it("should correctly set values", async () => {
      expect(await vaultProxy.strategyPart(await strategy1.getAddress())).to.be.eq(0n);
      expect(await vaultProxy.strategyPart(await strategy2.getAddress())).to.be.eq(0n);

      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      expect(await vaultProxy.strategyPart(await strategy1.getAddress())).to.be.eq(50n * 10n ** 25n);
      expect(await vaultProxy.strategyPart(await strategy2.getAddress())).to.be.eq(50n * 10n ** 25n);
    });

    it("should correctly re-set values", async () => {
      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      await vaultProxy.connect(ALICE).deposit(10n * 10n ** 18n, ALICE.address);
      await vaultProxy.connect(BOB).deposit(10n * 10n ** 18n, BOB.address);

      expect(await vaultProxy.balanceOf(ALICE.address)).to.be.eq(10n * 10n ** 18n);
      expect(await vaultProxy.balanceOf(BOB.address)).to.be.eq(10n * 10n ** 18n);

      expect(await strategy1.balanceOf(asset.target)).to.be.eq(10n * 10n ** 18n);
      expect(await strategy2.balanceOf(asset.target)).to.be.eq(10n * 10n ** 18n);

      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [22n * 10n ** 25n, 78n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      expect(await vaultProxy.strategyPart(await strategy1.getAddress())).to.be.eq(22n * 10n ** 25n);
      expect(await vaultProxy.strategyPart(await strategy2.getAddress())).to.be.eq(78n * 10n ** 25n);

      expect(await vaultProxy.balanceOf(ALICE.address)).to.be.eq(10n * 10n ** 18n);
      expect(await vaultProxy.balanceOf(BOB.address)).to.be.eq(10n * 10n ** 18n);

      expect(await strategy1.balanceOf(asset.target)).to.be.eq(10n * 10n ** 18n);
      expect(await strategy2.balanceOf(asset.target)).to.be.eq(10n * 10n ** 18n);
    });

    it("should correctly force re-set values", async () => {
      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      await vaultProxy.connect(ALICE).deposit(10n * 10n ** 18n, ALICE.address);
      await vaultProxy.connect(BOB).deposit(10n * 10n ** 18n, BOB.address);

      expect(await vaultProxy.balanceOf(ALICE.address)).to.be.eq(10n * 10n ** 18n);
      expect(await vaultProxy.balanceOf(BOB.address)).to.be.eq(10n * 10n ** 18n);

      expect(await strategy1.balanceOf(asset.target)).to.be.eq(10n * 10n ** 18n);
      expect(await strategy2.balanceOf(asset.target)).to.be.eq(10n * 10n ** 18n);

      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [30n * 10n ** 25n, 70n * 10n ** 25n],
        [0n, 1n],
        true,
      );

      expect(await vaultProxy.strategyPart(await strategy1.getAddress())).to.be.eq(30n * 10n ** 25n);
      expect(await vaultProxy.strategyPart(await strategy2.getAddress())).to.be.eq(70n * 10n ** 25n);

      expect(await vaultProxy.balanceOf(ALICE.address)).to.be.eq(10n * 10n ** 18n);
      expect(await vaultProxy.balanceOf(BOB.address)).to.be.eq(10n * 10n ** 18n);

      expect(await strategy1.balanceOf(asset.target)).to.be.eq((20n * 10n ** 18n * (30n * 10n ** 25n)) / 10n ** 27n);
      expect(await strategy2.balanceOf(asset.target)).to.be.eq((20n * 10n ** 18n * (70n * 10n ** 25n)) / 10n ** 27n);
    });

    it("should revert if array sizes not equal", async () => {
      await expect(
        vaultProxy.setStrategiesPercents([strategy1.target, strategy2.target], [50n * 10n ** 25n], [0n, 1n], false),
      ).to.be.revertedWith("Vault: array sizes not equal");
    });

    it("should revert if caller not owner", async () => {
      await expect(
        vaultProxy
          .connect(ALICE)
          .setStrategiesPercents(
            [strategy1.target, strategy2.target],
            [50n * 10n ** 25n, 50n * 10n ** 25n],
            [0n, 1n],
            false,
          ),
      ).to.be.revertedWithCustomError(vaultProxy, "OwnableUnauthorizedAccount");
    });
  });

  describe("deposit", () => {
    it("should correctly deposit", async () => {
      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      await vaultProxy.connect(ALICE).deposit(10n * 10n ** 18n, ALICE.address);

      expect(await vaultProxy.balanceOf(ALICE.address)).to.be.eq(10n * 10n ** 18n);
      expect(await asset.balanceOf(strategy1.target)).to.be.eq(10n * 10n ** 18n);
      expect(await asset.balanceOf(strategy2.target)).to.be.eq(0n * 10n ** 18n);
      expect(await asset.balanceOf(vaultProxy.target)).to.be.eq(0n);
    });

    it("should deposit twice", async () => {
      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      await vaultProxy.connect(ALICE).deposit(10n * 10n ** 18n, ALICE.address);
      await vaultProxy.connect(BOB).deposit(100n * 10n ** 18n, BOB.address);

      expect(await vaultProxy.balanceOf(ALICE.address)).to.be.eq(10n * 10n ** 18n);
      expect(await vaultProxy.balanceOf(BOB.address)).to.be.eq(100n * 10n ** 18n);

      expect(await strategy1.balanceOf(asset.target)).to.be.eq(10n * 10n ** 18n);
      expect(await strategy2.balanceOf(asset.target)).to.be.eq(100n * 10n ** 18n);
    });

    it("should revert if the highest priority has zero part", async () => {
      await vaultProxy.setStrategiesPercents([strategy1.target, strategy2.target], [0n, 0n], [0n, 1n], false);

      await expect(vaultProxy.connect(ALICE).deposit(10n * 10n ** 18n, ALICE.address)).to.be.revertedWith(
        "Vault: priorities not set",
      );
    });
  });

  describe("mint", () => {
    it("should correctly mint", async () => {
      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      const balBefore = await asset.balanceOf(ALICE.address);
      await vaultProxy.connect(ALICE).mint(10n * 10n ** 18n, ALICE.address);
      expect(await vaultProxy.balanceOf(ALICE.address)).to.be.eq(10n * 10n ** 18n);
      expect(await asset.balanceOf(ALICE.address)).to.be.eq(balBefore - 10n * 10n ** 18n);
      expect(await asset.balanceOf(strategy1.target)).to.be.eq(10n * 10n ** 18n);
      expect(await asset.balanceOf(strategy2.target)).to.be.eq(0n * 10n ** 18n);
      expect(await asset.balanceOf(vaultProxy.target)).to.be.eq(0n);
    });

    it("should correctly mint twice", async () => {
      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      await vaultProxy.connect(ALICE).mint(10n * 10n ** 18n, ALICE.address);
      await vaultProxy.connect(BOB).mint(100n * 10n ** 18n, BOB.address);
      expect(await vaultProxy.balanceOf(ALICE.address)).to.be.eq(10n * 10n ** 18n);
      expect(await vaultProxy.balanceOf(BOB.address)).to.be.eq(100n * 10n ** 18n);
    });
  });

  describe("withdraw", () => {
    it("should correctly withdraw", async () => {
      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      await vaultProxy.connect(ALICE).deposit(10n * 10n ** 18n, ALICE.address);
      const balBefore = await asset.balanceOf(ALICE.address);
      expect(await asset.balanceOf(strategy1.target)).to.be.eq(10n * 10n ** 18n);
      expect(await asset.balanceOf(strategy2.target)).to.be.eq(0n);

      await vaultProxy.connect(ALICE).withdraw(5n * 10n ** 18n, ALICE.address, ALICE.address);

      expect(await asset.balanceOf(ALICE.address)).to.be.eq(balBefore + 5n * 10n ** 18n);
      expect(await asset.balanceOf(strategy1.target)).to.be.eq(5n * 10n ** 18n);
      expect(await asset.balanceOf(strategy2.target)).to.be.eq(0n);
      expect(await asset.balanceOf(vaultProxy.target)).to.be.eq(0n);
    });

    it("should correctly withdraw twice", async () => {
      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      await vaultProxy.connect(ALICE).deposit(10n * 10n ** 18n, ALICE.address);
      await vaultProxy.connect(BOB).deposit(100n * 10n ** 18n, BOB.address);

      const bobBefore = await asset.balanceOf(BOB.address);
      const aliceBefore = await asset.balanceOf(ALICE.address);

      await vaultProxy.connect(ALICE).withdraw(5n * 10n ** 18n, ALICE.address, ALICE.address);
      await vaultProxy.connect(BOB).withdraw(50n * 10n ** 18n, BOB.address, BOB.address);

      expect(await asset.balanceOf(ALICE.address)).to.be.eq(aliceBefore + 5n * 10n ** 18n);
      expect(await asset.balanceOf(BOB.address)).to.be.eq(bobBefore + 50n * 10n ** 18n);

      expect(await strategy1.balanceOf(asset.target)).to.be.eq(10n * 10n ** 18n);
      expect(await strategy2.balanceOf(asset.target)).to.be.eq(45n * 10n ** 18n); // 100 - (50 + 5)
    });

    it("should revert if the highest priority has zero part", async () => {
      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      await vaultProxy.connect(ALICE).deposit(10n * 10n ** 18n, ALICE.address);

      await vaultProxy.setStrategiesPercents([strategy1.target, strategy2.target], [0n, 0n], [0n, 1n], false);

      await expect(
        vaultProxy.connect(ALICE).withdraw(5n * 10n ** 18n, ALICE.address, ALICE.address),
      ).to.be.revertedWith("Vault: priorities not set");
    });
  });

  describe("redeem", () => {
    it("should correctly redeem", async () => {
      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      await vaultProxy.connect(ALICE).deposit(10n * 10n ** 18n, ALICE.address);
      const balBefore = await asset.balanceOf(ALICE.address);
      await vaultProxy.connect(ALICE).redeem(5n * 10n ** 18n, ALICE.address, ALICE.address);

      expect(await asset.balanceOf(ALICE.address)).to.be.eq(balBefore + 5n * 10n ** 18n);
      expect(await asset.balanceOf(strategy1.target)).to.be.eq(5n * 10n ** 18n);
      expect(await asset.balanceOf(strategy2.target)).to.be.eq(0n);
      expect(await asset.balanceOf(vaultProxy.target)).to.be.eq(0n);
    });

    it("should correctly redeem twice", async () => {
      await vaultProxy.setStrategiesPercents(
        [strategy1.target, strategy2.target],
        [50n * 10n ** 25n, 50n * 10n ** 25n],
        [0n, 1n],
        false,
      );

      await vaultProxy.connect(ALICE).deposit(10n * 10n ** 18n, ALICE.address);
      await vaultProxy.connect(BOB).deposit(100n * 10n ** 18n, BOB.address);

      const bobBefore = await asset.balanceOf(BOB.address);
      const aliceBefore = await asset.balanceOf(ALICE.address);

      await vaultProxy.connect(ALICE).redeem(5n * 10n ** 18n, ALICE.address, ALICE.address);
      await vaultProxy.connect(BOB).redeem(50n * 10n ** 18n, BOB.address, BOB.address);

      expect(await asset.balanceOf(ALICE.address)).to.be.eq(aliceBefore + 5n * 10n ** 18n);
      expect(await asset.balanceOf(BOB.address)).to.be.eq(bobBefore + 50n * 10n ** 18n);
    });
  });
});
